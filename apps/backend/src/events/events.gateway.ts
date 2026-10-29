import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtVerifyOptions } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository } from '../common/repositories';
import { USER_TYPE_MERCHANT, USER_TYPE_TEAM_MEMBER } from '../common/constants';
import {
  WS_EVENTS,
  StampsUpdatedPayload,
  NotificationNewPayload,
  TransactionRecordedPayload,
  CouponUpdatedPayload,
  ScratchCardsChangedPayload,
  CouponRedeemedPayload,
} from './events.types';

// React Native's Android WebSocket sends the server's own URL as Origin, e.g.
// http://localhost:3000 through `adb reverse` or http://192.168.x.x:3000 on the LAN.
const DEV_ORIGIN_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

function isDevOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    return DEV_ORIGIN_HOST.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * WebSocket gateway for real-time bidirectional communication.
 *
 * Rooms:
 *   - `client:<clientId>`   → client app subscribes here
 *   - `merchant:<merchantId>` → merchant app subscribes here
 *
 * Auth: JWT token passed via `auth.token` in the handshake.
 * On connect, the socket is auto-joined to the appropriate room.
 */
@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Allow connections with no origin (mobile apps, server-to-server).
      // React Native / native WebSocket clients commonly send the literal
      // string "null" as the Origin header rather than omitting it entirely.
      if (!origin || origin === 'null') return cb(null, true);
      if (isDevOrigin(origin)) return cb(null, true);
      const corsOrigins = process.env.CORS_ORIGINS;
      if (!corsOrigins) {
        // Reject all browser origins when CORS_ORIGINS is not configured
        return cb(new Error('WebSocket CORS rejected: CORS_ORIGINS not configured'));
      }
      const allowed = corsOrigins.split(',').map((o) => o.trim());
      // Forcer l'autorisation admin en prod
      if (!allowed.includes('https://admin-jitplus-97259.web.app')) {
        allowed.push('https://admin-jitplus-97259.web.app');
      }
      if (allowed.includes(origin)) return cb(null, true);
      cb(new Error('WebSocket CORS rejected'));
    },
    credentials: true,
  },
  // HTTP polling creates recurring Cloud Run requests; production clients use
  // WebSocket-only and Cloud Run session affinity supports the handshake.
  transports: ['websocket'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  /** Re-verify tokens and device sessions periodically to disconnect expired/revoked ones */
  private static readonly TOKEN_RECHECK_MS = 10 * 60 * 1000;
  private static readonly SESSION_QUERY_CHUNK = 500;
  private recheckInterval: ReturnType<typeof setInterval> | null = null;
  private verifyOptions: JwtVerifyOptions;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
  ) {}

  afterInit() {
    // Same constraints as the HTTP JwtStrategy, restricted to the audiences
    // that actually join rooms on this gateway.
    this.verifyOptions = {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: 'jitplus-api',
      audience: ['jitplus-merchant', 'jitplus-client'],
    };
    this.recheckInterval = setInterval(() => {
      this.recheckConnectedTokens().catch((err) =>
        this.logger.warn(`WS recheck failed: ${err instanceof Error ? err.message : 'unknown'}`),
      );
    }, EventsGateway.TOKEN_RECHECK_MS);
  }

  private static extractToken(socket: Socket): string | undefined {
    return socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');
  }

  private static isMerchantSide(type: unknown): boolean {
    return type === USER_TYPE_MERCHANT || type === USER_TYPE_TEAM_MEMBER;
  }

  private kick(socket: Socket, message: string) {
    socket.emit('auth_error', { message });
    socket.disconnect(true);
  }

  onModuleDestroy() {
    if (this.recheckInterval) {
      clearInterval(this.recheckInterval);
      this.recheckInterval = null;
    }
  }

  /** Re-verify JWT + device session for every connected socket; disconnect expired/revoked ones */
  private async recheckConnectedTokens() {
    const sockets = this.server?.sockets?.sockets;
    if (!sockets) return;

    const bySession = new Map<string, Socket[]>();
    for (const [, socket] of sockets) {
      const token = EventsGateway.extractToken(socket);
      if (!token) {
        this.kick(socket, 'Token missing');
        continue;
      }
      try {
        const payload = this.jwtService.verify(token, this.verifyOptions);
        if (payload.jti && EventsGateway.isMerchantSide(payload.type)) {
          const list = bySession.get(payload.jti) ?? [];
          list.push(socket);
          bySession.set(payload.jti, list);
        }
      } catch {
        this.logger.debug(`WS token expired/revoked for ${socket.data.userId}, disconnecting ${socket.id}`);
        this.kick(socket, 'Token expired or revoked');
      }
    }

    const tokenIds = [...bySession.keys()];
    for (let i = 0; i < tokenIds.length; i += EventsGateway.SESSION_QUERY_CHUNK) {
      const chunk = tokenIds.slice(i, i + EventsGateway.SESSION_QUERY_CHUNK);
      const alive = await this.deviceSessionRepo.findMany({
        where: { tokenId: { in: chunk } },
        select: { tokenId: true },
      });
      const aliveIds = new Set(alive.map((s) => s.tokenId));
      for (const tokenId of chunk) {
        if (aliveIds.has(tokenId)) continue;
        for (const socket of bySession.get(tokenId) ?? []) {
          this.kick(socket, 'Session revoked');
        }
      }
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token = EventsGateway.extractToken(client);

      if (!token) {
        this.kick(client, 'No token provided');
        return;
      }

      const payload = this.jwtService.verify(token, this.verifyOptions);

      const userId = payload.sub;
      const userType = payload.type as string;

      // Mirrors JwtStrategy: merchant-side tokens carrying a jti must map to a
      // live DeviceSession, otherwise the user logged out or was revoked.
      if (payload.jti && EventsGateway.isMerchantSide(userType)) {
        const session = await this.deviceSessionRepo.findUnique({
          where: { tokenId: payload.jti },
          select: { id: true },
        });
        if (!session) {
          this.kick(client, 'Session revoked');
          return;
        }
      }

      // Store user info on the socket for later use
      client.data.userId = userId;
      client.data.userType = userType;

      // Join the appropriate room
      if (userType === 'client') {
        await client.join(`client:${userId}`);
      } else if (userType === 'merchant' || userType === 'team_member') {
        // Team members join the same merchant room
        await client.join(`merchant:${userId}`);
      }

      this.logger.debug(`WS connected: ${userType}:${userId} (${client.id})`);
    } catch (err) {
      this.logger.warn(`WS auth failed for ${client.id}: ${err instanceof Error ? err.message : 'unknown'}`);
      this.kick(client, 'Invalid or expired token');
    }
  }

  handleDisconnect(client: Socket) {
    const { userId, userType } = client.data || {};
    if (userId) {
      this.logger.debug(`WS disconnected: ${userType}:${userId} (${client.id})`);
    }
  }

  // ── Emit helpers (called by services) ────────────────────────

  /** Notify a client that their stamps balance changed */
  emitStampsUpdated(clientId: string, payload: StampsUpdatedPayload) {
    this.server
      .to(`client:${clientId}`)
      .emit(WS_EVENTS.STAMPS_UPDATED, payload);
  }

  /** Notify a client of a new notification */
  emitNotificationNew(clientId: string, payload: NotificationNewPayload) {
    this.server
      .to(`client:${clientId}`)
      .emit(WS_EVENTS.NOTIFICATION_NEW, payload);
  }

  /** Notify a merchant that a transaction was recorded (useful for multi-device) */
  emitTransactionRecorded(merchantId: string, payload: TransactionRecordedPayload) {
    this.server
      .to(`merchant:${merchantId}`)
      .emit(WS_EVENTS.TRANSACTION_RECORDED, payload);
  }

  emitCouponUpdated(clientIds: string | string[], payload: CouponUpdatedPayload) {
    const ids = Array.isArray(clientIds) ? clientIds : [clientIds];
    if (ids.length === 0) return;
    this.server.to(ids.map((id) => `client:${id}`)).emit(WS_EVENTS.COUPON_UPDATED, payload);
  }

  emitScratchCardsChanged(clientIds: string | string[], payload: ScratchCardsChangedPayload) {
    const ids = Array.isArray(clientIds) ? clientIds : [clientIds];
    if (ids.length === 0) return;
    this.server.to(ids.map((id) => `client:${id}`)).emit(WS_EVENTS.SCRATCH_CARDS_CHANGED, payload);
  }

  emitCouponRedeemed(merchantId: string, payload: CouponRedeemedPayload) {
    this.server.to(`merchant:${merchantId}`).emit(WS_EVENTS.COUPON_REDEEMED, payload);
  }
}
