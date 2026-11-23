import { UnauthorizedException } from '@nestjs/common';
import { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MINUTES } from '../constants';

/**
 * Shape of a user record that supports brute-force lockout.
 * Works for Merchant, TeamMember, Client and Admin models.
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
  /**
   * Atomically record one failed attempt and return the NEW counter value.
   * Must be a single SQL increment (never read-modify-write in JS): parallel
   * wrong-password requests would otherwise all read N and all write N+1,
   * multiplying the guesses allowed per lockout window.
   */
  recordFailedAttempt(id: string): Promise<number>;
  /** Lock the account until the given date. */
  lock(id: string, lockedUntil: Date): Promise<void>;
  resetFailedAttempts(id: string): Promise<void>;
}

/** Minimal Prisma delegate shape needed by {@link prismaLockoutOps}. */
interface LockableDelegate {
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
    select?: { failedLoginAttempts: true };
  }): Promise<{ failedLoginAttempts: number }>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

/**
 * Lockout ops for any Prisma model with `failedLoginAttempts` + `lockedUntil`.
 * The delegate is accepted loosely: Prisma's generic method signatures are not
 * structurally assignable to {@link LockableDelegate}.
 */
export function prismaLockoutOps(repo: unknown): LockoutDbOps {
  const delegate = repo as LockableDelegate;
  return {
    recordFailedAttempt: async (id) => {
      // An expired lock restarts the count (otherwise the first wrong attempt
      // after expiry would re-lock at 6/5). Conditional on lockedUntil < now so
      // concurrent requests reset it at most once.
      await delegate.updateMany({
        where: { id, lockedUntil: { lt: new Date() } },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      const row = await delegate.update({
        where: { id },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });
      return row.failedLoginAttempts;
    },
    lock: async (id, lockedUntil) => {
      await delegate.update({ where: { id }, data: { lockedUntil } });
    },
    resetFailedAttempts: async (id) => {
      await delegate.update({
        where: { id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    },
  };
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
    // on the very next wrong attempt (the DB side is reset atomically in
    // recordFailedAttempt).
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }
}

/**
 * Record a failed attempt atomically and lock the account once the limit is
 * reached. Returns the new attempt count.
 */
export async function recordFailedLogin(
  user: LockableUser,
  dbOps: LockoutDbOps,
): Promise<{ attempts: number; locked: boolean }> {
  const attempts = await dbOps.recordFailedAttempt(user.id);
  const locked = attempts >= MAX_LOGIN_ATTEMPTS;
  if (locked) {
    await dbOps.lock(user.id, new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000));
  }
  return { attempts, locked };
}

/**
 * Handle a failed login attempt: increment counter, possibly lock, then throw.
 */
export async function handleFailedLogin(
  user: LockableUser,
  dbOps: LockoutDbOps,
): Promise<never> {
  const { attempts } = await recordFailedLogin(user, dbOps);

  const remaining = MAX_LOGIN_ATTEMPTS - attempts;
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
