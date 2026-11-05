/**
 * Map with a hard size cap and least-recently-used eviction.
 *
 * Used as the Keyv store behind the global cache: cache-manager v6 ignores the
 * old `max` option, and Keyv's default Map only drops an expired entry when
 * that exact key is read again, so keys that are never re-read (geocode
 * queries, revoked-session markers…) used to accumulate until the 512 Mi
 * instance ran out of memory.
 */
export class LruMap<K, V> extends Map<K, V> {
  constructor(private readonly maxEntries: number) {
    super();
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError(`LruMap size must be a positive integer, got ${maxEntries}`);
    }
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    // Re-insert to mark as most recently used (Map keeps insertion order).
    const value = super.get(key) as V;
    super.delete(key);
    super.set(key, value);
    return value;
  }

  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (this.size > this.maxEntries) {
      const oldest = this.keys().next().value as K;
      super.delete(oldest);
    }
    return this;
  }
}
