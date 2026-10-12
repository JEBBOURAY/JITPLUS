import type { ScratchCardDto } from '@jitplus/shared/src/scratch';

/**
 * Where a scratch card stands for the client:
 * - pending: still to scratch
 * - toUse: scratched, coupon still usable at the merchant
 * - used / expired / cancelled: coupon state once the card is scratched
 * - missed: card expired or was cancelled before being scratched
 */
export type ScratchEntryStatus = 'pending' | 'toUse' | 'used' | 'expired' | 'cancelled' | 'missed';

type CardLike = Pick<ScratchCardDto, 'status' | 'expiresAt' | 'scratchedAt' | 'coupon'>;

export function getScratchEntryStatus(card: CardLike, now: Date = new Date()): ScratchEntryStatus {
  const coupon = card.coupon;
  if (coupon) {
    if (coupon.status === 'REDEEMED') return 'used';
    if (coupon.status === 'CANCELLED') return 'cancelled';
    // The server maps past-due coupons to EXPIRED, but cached data can age.
    if (coupon.status === 'EXPIRED' || new Date(coupon.expiresAt).getTime() <= now.getTime()) return 'expired';
    return 'toUse';
  }
  if (card.status === 'PENDING' && new Date(card.expiresAt).getTime() > now.getTime()) return 'pending';
  return 'missed';
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** Splits the client's cards into the three lists of the scratch screen. */
export function splitScratchCards<T extends CardLike>(cards: T[], now: Date = new Date()) {
  const pending: T[] = [];
  const toUse: T[] = [];
  const past: T[] = [];
  for (const card of cards) {
    const status = getScratchEntryStatus(card, now);
    if (status === 'pending') pending.push(card);
    else if (status === 'toUse') toUse.push(card);
    else past.push(card);
  }
  pending.sort((a, b) => time(a.expiresAt) - time(b.expiresAt));
  toUse.sort((a, b) => time(a.coupon?.expiresAt) - time(b.coupon?.expiresAt));
  past.sort((a, b) => time(b.scratchedAt ?? b.expiresAt) - time(a.scratchedAt ?? a.expiresAt));
  return { pending, toUse, past };
}
