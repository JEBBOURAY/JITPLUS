import { Image } from 'react-native';
import { resolveImageUrl } from './imageUrl';

/** Set of URLs already prefetched during this session — avoids duplicate network calls. */
const prefetched = new Set<string>();

/** Evict the oldest entries when the cache exceeds this size to prevent memory bloat. */
const MAX_CACHE_SIZE = 500;

/** Maximum number of concurrent prefetch requests to avoid UI jank. */
const BATCH_SIZE = 6;

/**
 * Prefetch an array of image URLs into the native image cache.
 * Silently ignores failures — best-effort caching.
 * Skips URLs that were already prefetched in this session.
 * Processes in batches to avoid flooding the network/UI thread.
 */
export function prefetchImages(urls: (string | null | undefined)[]): void {
  const unique = [...new Set(urls.filter(Boolean) as string[])];
  const pending: string[] = [];
  for (const url of unique) {
    const resolved = resolveImageUrl(url);
    if (prefetched.has(resolved)) continue;
    // LRU eviction: remove oldest entry instead of clearing the entire set
    if (prefetched.size >= MAX_CACHE_SIZE) {
      const oldest = prefetched.values().next().value;
      if (oldest) prefetched.delete(oldest);
    }
    prefetched.add(resolved);
    pending.push(resolved);
  }
  // Process in batches
  let i = 0;
  function nextBatch() {
    const batch = pending.slice(i, i + BATCH_SIZE);
    if (!batch.length) return;
    i += BATCH_SIZE;
    Promise.allSettled(batch.map((u) => Image.prefetch(u)))
      .then(nextBatch)
      .catch((e) => { if (__DEV__) console.warn('[imageCache] batch error:', e); });
  }
  nextBatch();
}
