import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DEVICE_SESSION_REPOSITORY } from '../../common/repositories';
import type { IDeviceSessionRepository } from '../../common/repositories';
import { JwtPayload, JwtTokenPayload } from '../../common/interfaces/jwt-payload.interface';
import { SESSION_CACHE_TTL, LAST_ACTIVE_THROTTLE_MS } from '../../common/constants';
import { errMsg } from '../../common/utils';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private static readonly CACHE_TTL = SESSION_CACHE_TTL;
  private static readonly LAST_ACTIVE_THROTTLE_MS = LAST_ACTIVE_THROTTLE_MS;

  constructor(
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
  }

  /**
   * Immediately remove a session from the standard cache.
   * Called on logout to close the replay window across scaled cloud runs
   */
  async invalidateSession(tokenId: string): Promise<void> {
    await this.cacheManager.del(`session:${tokenId}`);
  }

  async validate(payload: JwtTokenPayload): Promise<JwtPayload> {
    // Check admin session revocation (cache-based blacklist)
    if (payload.jti && payload.type === 'admin') {
      const revoked = await this.cacheManager.get<boolean>(`admin-revoked:${payload.jti}`);
      if (revoked) {
        throw new UnauthorizedException('Session admin révoquée. Veuillez vous reconnecter.');
      }
    }

    // Validate DeviceSession for merchant and team_member tokens.
    // This ensures revoked sessions (logout) are immediately rejected.
    if (payload.jti && (payload.type === 'merchant' || payload.type === 'team_member')) {
      const now = Date.now();
      const cached = await this.cacheManager.get<number>(`session:${payload.jti}`);

      // Only hit DB if cache is missing
      if (!cached) {
        const session = await this.deviceSessionRepo.findUnique({
          where: { tokenId: payload.jti },
          select: { id: true, lastActiveAt: true },
        });

        if (!session) {
          await this.cacheManager.del(`session:${payload.jti}`);
          throw new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
        }

        // Cache this session validation for 30 seconds
        await this.cacheManager.set(`session:${payload.jti}`, now + JwtStrategy.CACHE_TTL, JwtStrategy.CACHE_TTL);

        // Mise à jour non-bloquante de lastActiveAt (throttle: toutes les 5 min)
        if (session.lastActiveAt.getTime() < now - JwtStrategy.LAST_ACTIVE_THROTTLE_MS) {
          this.deviceSessionRepo.update({
            where: { id: session.id },
            data: { lastActiveAt: new Date() },
          }).catch((err: unknown) => this.logger.warn('lastActiveAt update failed', errMsg(err)));
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
