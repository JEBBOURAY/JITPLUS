import { UnauthorizedException } from '@nestjs/common';
import { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MINUTES } from '../constants';

/**
 * Shape of a user record that supports brute-force lockout.
 * Works for Merchant, TeamMember, and Client models.
 */
export interface LockableUser {
  id: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/**
 * DB callbacks for updating failed attempts — keeps this helper ORM-agnostic.
 */
export interface LockoutDbOps {
  incrementFailedAttempts(id: string, newAttempts: number, lockedUntil?: Date): Promise<void>;
  resetFailedAttempts(id: string): Promise<void>;
}

/**
 * Check if a user account is currently locked out.
 * Throws UnauthorizedException with a French message if locked.
 */
export function checkLockout(user: LockableUser): void {
  if (
    user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS &&
    user.lockedUntil
  ) {
    if (user.lockedUntil > new Date()) {
      // Account is still locked
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(
        `Compte temporairement verrouillé suite à trop de tentatives. Réessayez dans ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
      );
    }
    // Lockout has expired — reset the counter so the user isn't re-locked
    // on the very next wrong attempt (prevents infinite lockout loop)
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }
}

/**
 * Handle a failed login attempt: increment counter, possibly lock, then throw.
 */
export async function handleFailedLogin(
  user: LockableUser,
  dbOps: LockoutDbOps,
): Promise<never> {
  const newAttempts = (user.failedLoginAttempts || 0) + 1;
  const lockedUntil = newAttempts >= MAX_LOGIN_ATTEMPTS
    ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000)
    : undefined;

  await dbOps.incrementFailedAttempts(user.id, newAttempts, lockedUntil);

  const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
  if (remaining > 0) {
    throw new UnauthorizedException(
      `Identifiants invalides (${remaining} essai${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''})`,
    );
  }
  throw new UnauthorizedException(
    `Compte verrouillé pour ${LOGIN_LOCKOUT_MINUTES} minutes suite à trop de tentatives.`,
  );
}

/**
 * Reset failed login attempts after a successful login (if needed).
 */
export async function resetLoginAttempts(
  user: LockableUser,
  dbOps: LockoutDbOps,
): Promise<void> {
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await dbOps.resetFailedAttempts(user.id);
  }
}
