import { Injectable, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ADMIN_USER_REPOSITORY, type IAdminUserRepository } from '../common/repositories';
import { checkLockout, recordFailedLogin, resetLoginAttempts, LockoutDbOps, prismaLockoutOps } from '../common/utils/login-lockout.helper';
import { MS_PER_DAY } from '../common/constants';
import { maskEmail } from '../common/utils/pii-mask';

/** Single response for every failed admin login (no account-state oracle). */
const ADMIN_LOGIN_FAILED = 'Email ou mot de passe incorrect';

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
   * Revoke the admin's tokens. The source of truth is Admin.tokensValidAfter,
   * checked by AdminGuard on every request: it holds on every instance and
   * across restarts (the in-memory cache alone did not — security audit
   * 2026-11-21). Every token of this admin issued before now is rejected.
   * The cache entry keeps the immediate local rejection in JwtStrategy.
   */
  async logout(jti: string | undefined, adminId: string): Promise<{ message: string }> {
    await this.adminRepo.update({ where: { id: adminId }, data: { tokensValidAfter: new Date() } });
    if (!jti) return { message: 'Déconnecté' };
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
    return prismaLockoutOps(this.adminRepo);
  }

  async login(email: string, password: string) {
    const admin = await this.adminRepo.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Lockout is checked BEFORE the password: while locked, the password is
    // not evaluated and the lock is not extended, so the response cannot
    // reveal a correct guess and attempts cannot keep the admin locked out.
    // checkLockout also clears an expired lock on the in-memory record.
    let locked = false;
    if (admin) {
      try {
        checkLockout(admin);
      } catch {
        locked = true;
      }
    }

    // Always run bcrypt.compare to keep timing uniform (email enumeration)
    const passwordValid = await bcrypt.compare(
      password,
      admin && !locked ? admin.password : AdminAuthService.DUMMY_HASH,
    );

    // One generic message for every failure (unknown email, wrong password,
    // locked, deactivated): no oracle on the account state.
    if (!admin || locked || !passwordValid || !admin.isActive) {
      if (admin && !locked && !passwordValid) {
        const { attempts, locked: nowLocked } = await recordFailedLogin(admin, this.adminLockoutOps);
        if (nowLocked) this.logger.warn(`Admin account ${maskEmail(admin.email)} locked after ${attempts} failed attempts`);
      }
      throw new UnauthorizedException(ADMIN_LOGIN_FAILED);
    }

    // Successful login — reset failed attempts
    await resetLoginAttempts(admin, this.adminLockoutOps);

    const jti = randomUUID();
    const payload = {
      sub: admin.id,
      email: admin.email,
      type: 'admin' as const,
      role: 'admin' as const,
      jti,
      // Millisecond issue time: `iat` is whole seconds, too coarse to order a
      // login against a logout in the same second (AdminGuard).
      iatMs: Date.now(),
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
