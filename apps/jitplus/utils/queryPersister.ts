import { createQueryPersister, shouldDehydrateQuery } from '@jitplus/shared/src/createQueryPersister';

export const QUERY_CACHE_KEY = 'jitplus-query-cache';

export const asyncStoragePersister = createQueryPersister(QUERY_CACHE_KEY);

/**
 * Account data that must not land on disk (nor in device backups): coupon and
 * scratch-card QR tokens, payout history (bank details), referral stats.
 */
const CLIENT_PRIVATE_KEYS = new Set(['scratch', 'payouthistory', 'referralstats']);

export function shouldPersistQuery(query: {
  queryKey: readonly unknown[];
  state: { status: string };
}): boolean {
  if (query.state.status !== 'success') return false;
  // Geo queries change with every map pan — not worth persisting
  if (query.queryKey.includes('merchants-nearby')) return false;
  // Deals depend on the position and expire within days: a stale list on disk would show ended offers.
  if (query.queryKey[0] === 'deals') return false;
  if (!shouldDehydrateQuery(query)) return false;
  return !CLIENT_PRIVATE_KEYS.has(String(query.queryKey[0] ?? '').toLowerCase());
}
