import { getDistanceKm } from '@/utils/distance';
import type { Merchant } from '@/types';

export type MerchantStore = NonNullable<Merchant['stores']>[number];

export interface StoreWithDistance extends MerchantStore {
  /** Null when the user position or the store coordinates are unknown. */
  distanceKm: number | null;
}

export function hasCoords(store: { latitude?: number | null; longitude?: number | null }): store is { latitude: number; longitude: number } {
  return typeof store.latitude === 'number' && typeof store.longitude === 'number'
    && !Number.isNaN(store.latitude) && !Number.isNaN(store.longitude);
}

/** Stores with their distance to the user, nearest first when the position is known. */
export function withDistances(
  stores: MerchantStore[] | undefined,
  user: { latitude: number; longitude: number } | null,
): StoreWithDistance[] {
  const list = (stores ?? []).map((s) => ({
    ...s,
    distanceKm: user && hasCoords(s) ? getDistanceKm(user.latitude, user.longitude, s.latitude, s.longitude) : null,
  }));
  if (!user) return list;
  return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
