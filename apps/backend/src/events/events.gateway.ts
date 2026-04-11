import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import {
  WS_EVENTS,
  PointsUpdatedPayload,
  NotificationNewPayload,
  TransactionRecordedPayload,
} from './events.types';

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
      // Allow connections with no origin (mobile apps, server-to-server)
      if (!origin) return cb(null, true);
      const corsOrigins = process.env.CORS_ORIGINS;
      if (!corsOrigins) {
        // Reject all browser origins when CORS_ORIGINS is not configured
        return cb(new Error('WebSocket CORS rejected: CORS_ORIGINS not configured'));
      }
      const allowed = corsOrigins.split(',').map((o) => o.trim());
      if (allowed.includes(origin)) return cb(null, true);
      cb(new Error('WebSocket CORS rejected'));
    },
    credentials: true,
  },
  transports: ['websocket'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  /** Re-verify tokens periodically to disconnect revoked sessions (1h — JWT strategy already validates per-request) */
  private static readonly TOKEN_RECHECK_MS = 60 * 60 * 1000;
  private recheckInterval: ReturnType<typeof setInterval> | null = null;
  private jwtSecret: string;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  afterInit() {
    // Cache JWT secret once to avoid repeated config lookups
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    // Periodically re-verify all connected sockets' tokens
    this.recheckInterval = setInterval(() => {
      this.recheckConnectedTokens();
    }, EventsGateway.TOKEN_RECHECK_MS);
  }

  onModuleDestroy() {
    if (this.recheckInterval) {
      clearInterval(this.recheckInterval);
      this.recheckInterval = null;
    }
  }

  /** Re-verify JWT for every connected socket; disconnect expired/revoked ones */
  private recheckConnectedTokens() {
    const sockets = this.server?.sockets?.sockets;
    if (!sockets) return;

    for (const [, socket] of sockets) {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        socket.emit('auth_error', { message: 'Token missing' });
        socket.disconnect(true);
        continue;
      }
      try {
        this.jwtService.verify(token, {
          secret: this.jwtSecret,
        });
      } catch {
        this.logger.debug(`WS token expired/revoked for ${socket.data.userId}, disconnecting ${socket.id}`);
        socket.emit('auth_error', { message: 'Token expired or revoked' });
        socket.disconnect(true);
      }
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.emit('auth_error', { message: 'No token provided' });
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.jwtSecret,
      });

      const userId = payload.sub;
      const userType = payload.type as string;

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

      this.logger.log(`WS connected: ${userType}:${userId} (${client.id})`);
    } catch (err) {
      this.logger.warn(`WS auth failed for ${client.id}: ${err instanceof Error ? err.message : 'unknown'}`);
      client.emit('auth_error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const { userId, userType } = client.data || {};
    if (userId) {
      this.logger.debug(`WS disconnected: ${userType}:${userId} (${client.id})`);
    }
  }

  // ── Emit helpers (called by services) ────────────────────────

  /** Notify a client that their points/stamps balance changed */
  emitPointsUpdated(clientId: string, payload: PointsUpdatedPayload) {
    this.server
      .to(`client:${clientId}`)
      .emit(WS_EVENTS.POINTS_UPDATED, payload);
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
}
