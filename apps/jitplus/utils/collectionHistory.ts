import type { ClientCollectionGift } from '@jitplus/shared/src/collection';

/**
 * Where the gift of a completed collection stands for the client:
 * - soon: won, usable from a later date (gift delay set by the merchant)
 * - toUse: usable now at the merchant
 * - used / expired / cancelled: final coupon state
 * - gone: the coupon no longer exists
 */
export type CollectionGiftStatus = 'soon' | 'toUse' | 'used' | 'expired' | 'cancelled' | 'gone';

export function getCollectionGiftStatus(gift: Pick<ClientCollectionGift, 'coupon'>, now: Date = new Date()): CollectionGiftStatus {
  const coupon = gift.coupon;
  if (!coupon) return 'gone';
  if (coupon.status === 'REDEEMED') return 'used';
  if (coupon.status === 'CANCELLED') return 'cancelled';
  // The server maps past-due coupons to EXPIRED, but cached data can age.
  if (coupon.status === 'EXPIRED' || new Date(coupon.expiresAt).getTime() <= now.getTime()) return 'expired';
  return new Date(coupon.validFrom).getTime() > now.getTime() ? 'soon' : 'toUse';
}

/** Gifts still to use (soonest expiry first) and the others (latest first). */
export function splitCollectionGifts<T extends Pick<ClientCollectionGift, 'coupon' | 'completedAt'>>(gifts: T[], now: Date = new Date()) {
  const toUse: T[] = [];
  const past: T[] = [];
  for (const gift of gifts) {
    const status = getCollectionGiftStatus(gift, now);
    if (status === 'toUse' || status === 'soon') toUse.push(gift);
    else past.push(gift);
  }
  const expiry = (g: T) => (g.coupon ? new Date(g.coupon.expiresAt).getTime() : 0);
  toUse.sort((a, b) => expiry(a) - expiry(b));
  past.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  return { toUse, past };
}
