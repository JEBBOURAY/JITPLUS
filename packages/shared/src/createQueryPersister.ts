import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/** Query keys that must NOT be persisted to disk (sensitive / auth data). */
const SENSITIVE_KEYS = new Set(['profile', 'auth', 'token', 'otp', 'password', 'wallet', 'payment']);

/**
 * Returns true if a queryKey should be persisted.
 * Excludes keys whose first segment matches a known-sensitive keyword.
 */
export function shouldDehydrateQuery(query: { queryKey: readonly unknown[] }): boolean {
  const first = String(query.queryKey[0] ?? '').toLowerCase();
  return !SENSITIVE_KEYS.has(first);
}

/**
 * Create a Stale-While-Revalidate persister.
 *
 * Serialises the React Query cache to AsyncStorage so that on the next
 * app launch, the user sees the last-known data *instantly* while fresh
 * data is fetched in the background — zero loading spinners.
 */
export function createQueryPersister(cacheKey: string) {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: cacheKey,
    throttleTime: 1000,
  });
}
