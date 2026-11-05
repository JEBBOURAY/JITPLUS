import { createHash } from 'crypto';
import type { IMerchantRepository } from '../common/repositories';
import type { LockoutDbOps } from '../common/utils/login-lockout.helper';
import type { MerchantResponse } from '../common/interfaces/merchant-response.interface';
import type { LoginDto } from './dto/login.dto';

/** Shape returned by login/register containing an access token + merchant data. */
export interface AuthResult {
  access_token: string;
  /** Opaque refresh token — only present when a DeviceSession was created (login with deviceName). */
  refresh_token?: string;
  /** JWT ID (jti) of the access token — required to call /auth/refresh-token. */
  session_id?: string;
  merchant: MerchantResponse;
  userType: string;
  teamMember?: { id: string; nom: string; email: string; role: string };
}

/**
 * Email/password registration result. Email verification is currently disabled:
 * both flags are false. They stay in the contract for already-installed apps.
 */
export interface PendingRegistrationResult {
  merchant: MerchantResponse;
  userType: string;
  requiresEmailVerification: boolean;
  verificationSent: boolean;
}

/** Device fields sent at sign-in / sign-up (optional at sign-up, required at sign-in). */
export type DeviceInfo = Pick<LoginDto, 'deviceOS' | 'deviceId'> & { deviceName?: string };

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Lockout DB ops for Merchant model (password, Google and Apple sign-ins). */
export function merchantLockoutOps(merchantRepo: IMerchantRepository): LockoutDbOps {
  return {
    incrementFailedAttempts: (id, newAttempts, lockedUntil) =>
      merchantRepo.update({
        where: { id },
        data: { failedLoginAttempts: newAttempts, ...(lockedUntil && { lockedUntil }) },
      }).then(() => {}),
    resetFailedAttempts: (id) =>
      merchantRepo.update({
        where: { id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      }).then(() => {}),
  };
}
