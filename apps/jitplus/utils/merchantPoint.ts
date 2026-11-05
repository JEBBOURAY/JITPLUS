import type { Merchant } from '@/types';

/**
 * A map point is a merchant or one of its stores: the API returns one entry
 * per located store, all sharing the merchant's id.
 */

/** Unique key of a map point (merchant id, plus the store id for extra stores). */
export function pointKey(m: Pick<Merchant, 'id' | 'storeId'>): string {
  return m.storeId ? `${m.id}-${m.storeId}` : m.id;
}

/** Display name of a map point: the store's own name, else the merchant's. */
export function pointName(m: Pick<Merchant, 'storeName' | 'nomBoutique'>): string {
  return m.storeName || m.nomBoutique || '';
}
