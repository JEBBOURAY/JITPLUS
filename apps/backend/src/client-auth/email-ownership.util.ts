import type { IClientRepository } from '../common/repositories';

/**
 * Email ownership rules for client accounts (pre-hijack protection).
 *
 * PATCH /client-auth/profile lets a client put any free email on its account
 * with emailVerified=false. Such an unverified email is only a *claim*: it
 * must never let the account capture whoever later proves ownership of that
 * inbox (email OTP, Google, Apple). Proven ownership wins: the claim is
 * dropped from the squatting account and the owner gets an account of their own.
 */

/** Apple sends `email_verified` as a boolean or the string "true". */
export function isProviderEmailVerified(flag: unknown): boolean {
  return flag === true || flag === 'true';
}

/**
 * Removes `email` from `clientId` if it is still unverified there. Conditional
 * update, so a concurrent verification of the same email is never undone.
 * Returns true when the claim was released.
 */
export async function releaseUnverifiedEmail(
  clientRepo: IClientRepository,
  clientId: string,
  email: string,
): Promise<boolean> {
  const { count } = await clientRepo.updateMany({
    where: { id: clientId, email, emailVerified: false },
    data: { email: null },
  });
  return count === 1;
}
