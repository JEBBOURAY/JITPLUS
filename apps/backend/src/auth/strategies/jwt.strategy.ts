import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject, UnauthorizedException, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEVICE_SESSION_REPOSITORY } from '../../common/repositories';
import type { IDeviceSessionRepository } from '../../common/repositories';
import { JwtPayload, JwtTokenPayload } from '../../common/interfaces/jwt-payload.interface';
import { SESSION_CACHE_TTL, LAST_ACTIVE_THROTTLE_MS } from '../../common/constants';
import { errMsg } from '../../common/utils';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) implements OnModuleDestroy {
  private readonly logger = new Logger(JwtStrategy.name);

  /** In-memory session cache: tokenId → expiry timestamp */
  private sessionCache = new Map<string, number>();
  private static readonly CACHE_TTL = SESSION_CACHE_TTL;
  private static readonly MAX_CACHE_SIZE = 10_000;
  private static readonly CLEANUP_INTERVAL = 60_000;
  private static readonly LAST_ACTIVE_THROTTLE_MS = LAST_ACTIVE_THROTTLE_MS;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: 'jitplus-api',
      audience: ['jitplus-merchant', 'jitplus-client', 'jitplus-admin'],
    });

    // Periodic cleanup of expired entries
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.sessionCache) {
        if (expiry < now) this.sessionCache.delete(key);
      }
    }, JwtStrategy.CLEANUP_INTERVAL);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Immediately remove a session from the in-memory cache.
   * Called on logout to close the replay window (otherwise the cache
   * would still validate the token for up to CACHE_TTL seconds).
   */
  invalidateSession(tokenId: string): void {
    this.sessionCache.delete(tokenId);
  }

  async validate(payload: JwtTokenPayload): Promise<JwtPayload> {
    // DeviceSession is a merchant-only concept — clients don't have sessions in that table.
    // Only validate the session for merchant/admin tokens to avoid spurious 401s on client routes.
    if (payload.jti && payload.type !== 'client') {
      const now = Date.now();
      const cached = this.sessionCache.get(payload.jti);

      // Only hit DB if cache is missing or expired
      if (!cached || cached < now) {
        const session = await this.deviceSessionRepo.findUnique({
          where: { tokenId: payload.jti },
          select: { id: true, lastActiveAt: true },
        });

        if (!session) {
          this.sessionCache.delete(payload.jti);
          throw new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
        }

        // Cache this session validation for 30 seconds
        // Evict oldest entries if cache exceeds max size
        if (this.sessionCache.size >= JwtStrategy.MAX_CACHE_SIZE) {
          const firstKey = this.sessionCache.keys().next().value;
          if (firstKey) this.sessionCache.delete(firstKey);
        }
        this.sessionCache.set(payload.jti, now + JwtStrategy.CACHE_TTL);

        // Mise à jour non-bloquante de lastActiveAt (throttle: toutes les 5 min)
        if (session.lastActiveAt.getTime() < now - JwtStrategy.LAST_ACTIVE_THROTTLE_MS) {
          this.deviceSessionRepo.update({
            where: { id: session.id },
            data: { lastActiveAt: new Date() },
          }).catch((err) => this.logger.warn('lastActiveAt update failed', errMsg(err)));
        }
      }
    }

    return {
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      telephone: payload.telephone ?? undefined,
      type: payload.type,
      role: payload.role,
      sessionId: payload.jti ?? undefined,
      teamMemberId: payload.teamMemberId ?? undefined,
      teamMemberName: payload.teamMemberName ?? undefined,
    };
  }
}
