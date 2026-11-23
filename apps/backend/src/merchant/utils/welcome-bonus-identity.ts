import { createHmac } from 'crypto';
import type { TransactionClient } from '../../common/repositories';

/**
 * Welcome gift memory that survives account deletion.
 *
 * "Already received / no longer new here" used to be read from the client's
 * transactions only. Deleting the account anonymises it, and signing up again
 * with the same email gives a new client id with no history: the gift was
 * granted again, as often as wanted (code review 2026-11-21).
 *
 * When an account is closed, one row per merchant where the client has history
 * and per verified identity is kept in `welcome_bonus_claims`. Only a keyed
 * HMAC is stored: without the server secret the identity cannot be recovered
 * or even tested, and the row is not linked to the client.
 */

export interface WelcomeIdentitySource {
  email: string | null;
  emailVerified: boolean;
  telephone: string | null;
  telephoneVerified: boolean;
  googleId: string | null;
  appleId: string | null;
}

const IDENTITY_SELECT = {
  email: true,
  emailVerified: true,
  telephone: true,
  telephoneVerified: true,
  googleId: true,
  appleId: true,
} as const;

/** Stamps earned or gifted: the same definition as hasWelcomeBonusHistory. */
const HISTORY_TYPES: ('EARN_STAMPS' | 'WELCOME_BONUS')[] = ['EARN_STAMPS', 'WELCOME_BONUS'];

/**
 * Domain-separated key derived from a server secret. JWT_SECRET is always set
 * (app.module validation); WELCOME_BONUS_HMAC_SECRET overrides it, so that
 * rotating JWT_SECRET does not have to forget past gifts.
 */
function identityKey(): Buffer {
  const secret = process.env.WELCOME_BONUS_HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is not configured');
    return createHmac('sha256', 'dev-only-welcome-bonus').update('welcome-bonus-identity:v1').digest();
  }
  return createHmac('sha256', secret).update('welcome-bonus-identity:v1').digest();
}

/**
 * One hash per proven identity. An unverified email or phone is only a claim
 * (anyone can type it), so it neither blocks a gift nor is remembered.
 */
export function welcomeIdentityHashes(client: WelcomeIdentitySource): string[] {
  const identities: string[] = [];
  if (client.email && client.emailVerified) identities.push(`email:${client.email.trim().toLowerCase()}`);
  if (client.telephone && client.telephoneVerified) identities.push(`tel:${client.telephone.trim()}`);
  if (client.googleId) identities.push(`google:${client.googleId}`);
  if (client.appleId) identities.push(`apple:${client.appleId}`);
  if (identities.length === 0) return [];
  const key = identityKey();
  return identities.map((identity) => createHmac('sha256', key).update(identity).digest('hex'));
}

/** Whether a closed account with one of this client's identities had history at the merchant. */
export async function hasWelcomeBonusClaim(
  tx: Pick<TransactionClient, 'client' | 'welcomeBonusClaim'>,
  clientId: string,
  merchantId: string,
): Promise<boolean> {
  const client = await tx.client.findFirst({ where: { id: clientId }, select: IDENTITY_SELECT });
  const hashes = client ? welcomeIdentityHashes(client) : [];
  if (hashes.length === 0) return false;
  const row = await tx.welcomeBonusClaim.findFirst({
    where: { merchantId, identityHash: { in: hashes } },
    select: { id: true },
  });
  return !!row;
}

/**
 * Called when an account is closed, BEFORE it is anonymised and in the same
 * transaction. Keeps the memory for every merchant where the client earned or
 * was gifted stamps, under every identity they hold at that moment.
 */
export async function rememberWelcomeHistoryInTx(
  tx: Pick<TransactionClient, 'client' | 'transaction' | 'welcomeBonusClaim'>,
  clientId: string,
): Promise<number> {
  const client = await tx.client.findFirst({ where: { id: clientId }, select: IDENTITY_SELECT });
  const hashes = client ? welcomeIdentityHashes(client) : [];
  if (hashes.length === 0) return 0;

  const merchants = await tx.transaction.findMany({
    where: { clientId, type: { in: HISTORY_TYPES } },
    distinct: ['merchantId'],
    select: { merchantId: true },
  });
  if (merchants.length === 0) return 0;

  const { count } = await tx.welcomeBonusClaim.createMany({
    data: merchants.flatMap(({ merchantId }) => hashes.map((identityHash) => ({ merchantId, identityHash }))),
    skipDuplicates: true,
  });
  return count;
}
