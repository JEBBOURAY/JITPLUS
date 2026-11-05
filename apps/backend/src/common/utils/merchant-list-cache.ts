import type { Cache } from 'cache-manager';

// Only the pages jitplus reads are cached: limit=100 (MERCHANTS_PAGE_SIZE) and
// up to 20 pages (MAX_MERCHANT_PAGES in its services/api/merchants.ts). The
// route is public and accepts any page and limit: caching every combination
// let anyone fill the in-memory cache, and the store cannot delete by prefix,
// so those keys were never invalidated either.
const CACHED_LIMIT = 100;
const CACHED_PAGES = 20;

// Bumped by every invalidation. A cache miss that started reading before a
// write must not store its now outdated page (a banned merchant would stay on
// the map for the whole TTL). In-memory, like the cache itself.
let generation = 0;

/** Cache key of one page of the client-facing merchants list, or null when that page is not cached. */
export function merchantListCacheKey(page: number, limit: number): string | null {
  if (limit !== CACHED_LIMIT || page < 1 || page > CACHED_PAGES) return null;
  return `merchants:list:p${page}:l${limit}`;
}

/** Changes on each invalidation: compare before and after a database read. */
export function merchantListGeneration(): number {
  return generation;
}

/** Drops every cached page of the merchants list, so a change shows up at once on the map. */
export async function invalidateMerchantListCache(cache: Cache): Promise<void> {
  generation++;
  const dels: Promise<unknown>[] = [];
  for (let page = 1; page <= CACHED_PAGES; page++) {
    dels.push(cache.del(merchantListCacheKey(page, CACHED_LIMIT)!));
  }
  await Promise.allSettled(dels);
}
