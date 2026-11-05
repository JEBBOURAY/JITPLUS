import { Injectable, UnauthorizedException, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ADMIN_USER_REPOSITORY, type IAdminUserRepository } from '../common/repositories';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';
import { MS_PER_DAY } from '../common/constants';
import { maskEmail } from '../common/utils/pii-mask';

/** TTL for admin session revocation cache entries (24 hours) */
const ADMIN_REVOKE_TTL = MS_PER_DAY;

/**
 * Admin authentication: login (with lockout) and session revocation.
 *
 * The rest of the admin back-office lives in sub-domain services:
 * AdminDashboardService (global stats, notification log), AdminMerchantService,
 * AdminClientService and AdminReferralService.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly adminRepo: IAdminUserRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Revoke an admin session by blacklisting its jti in cache.
   * The JWT remains cryptographically valid but will be rejected by JwtStrategy.
   */
  async logout(jti: string): Promise<{ message: string }> {
    await this.cache.set(`admin-revoked:${jti}`, true, ADMIN_REVOKE_TTL);
    await this.cache.del(`admin-session:${jti}`);
    this.logger.log(`Admin session revoked (jti: ${jti})`);
    return { message: 'Déconnecté' };
  }

  /**
   * Authenticate an admin by email + password.
   * Returns a JWT token with type: 'admin'.
   */
  // Dummy hash for timing-safe comparison when admin not found
  private static readonly DUMMY_HASH = '$2a$12$LJ3m4ys3Lz0KDlu0BRahYOiFMfGHgdOUmrGfEdKnXqJRikMOFbECi';

  /** Lockout DB ops for Admin model */
  private get adminLockoutOps(): LockoutDbOps {
    return {
      incrementFailedAttempts: (id, newAttempts, lockedUntil) =>
        this.adminRepo.update({
          where: { id },
          data: { failedLoginAttempts: newAttempts, ...(lockedUntil && { lockedUntil }) },
        }).then(() => {}),
      resetFailedAttempts: (id) =>
        this.adminRepo.update({
          where: { id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }).then(() => {}),
    };
  }

  async login(email: string, password: string) {
    const admin = await this.adminRepo.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Always run bcrypt.compare to prevent timing attacks (email enumeration)
    const passwordValid = await bcrypt.compare(
      password,
      admin?.password ?? AdminAuthService.DUMMY_HASH,
    );

    if (!admin || !passwordValid) {
      // If admin exists, track failed attempt for lockout
      if (admin) {
        await handleFailedLogin(admin, this.adminLockoutOps);
      }
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Check if account is active
    if (!admin.isActive) {
      throw new ForbiddenException('Ce compte administrateur est désactivé.');
    }

    // Check lockout (too many failed attempts)
    checkLockout(admin);

    // Successful login — reset failed attempts
    await resetLoginAttempts(admin, this.adminLockoutOps);

    const jti = randomUUID();
    const payload = {
      sub: admin.id,
      email: admin.email,
      type: 'admin' as const,
      role: 'admin' as const,
      jti,
    };

    const token = this.jwtService.sign(payload);
    this.logger.log(`Admin ${maskEmail(admin.email)} logged in (jti: ${jti})`);

    // Cache admin session for revocation support
    // TTL = 24h (max reasonable JWT lifetime), auto-cleans expired entries
    await this.cache.set(`admin-session:${jti}`, true, MS_PER_DAY);

    return {
      access_token: token,
      admin: {
        id: admin.id,
        email: admin.email,
        nom: admin.nom,
        role: admin.role,
      },
    };
  }
}
