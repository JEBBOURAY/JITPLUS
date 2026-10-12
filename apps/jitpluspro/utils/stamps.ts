import { MAX_STAMPS_PER_TX } from '@/constants/app';

/** Purchase amount needed for 1 stamp when the merchant has no value yet (backend default). */
export const DEFAULT_AMOUNT_PER_STAMP = 10;

export interface StampsForAmount {
  stamps: number;
  /** True when the raw count exceeded MAX_STAMPS_PER_TX and was capped. */
  capped: boolean;
}

/**
 * Stamps earned by a purchase in PER_AMOUNT mode. Must stay identical to the
 * backend rule: min(floor(amount / amountPerStamp), MAX_STAMPS_PER_TX).
 */
export function computeStampsForAmount(
  amount: number,
  amountPerStamp: number | null | undefined,
): StampsForAmount {
  const rate = amountPerStamp || DEFAULT_AMOUNT_PER_STAMP;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return { stamps: 0, capped: false };
  }
  const raw = Math.floor(amount / rate);
  return { stamps: Math.min(raw, MAX_STAMPS_PER_TX), capped: raw > MAX_STAMPS_PER_TX };
}

/** Backend default for merchant.stampsForReward. */
export const DEFAULT_STAMPS_FOR_REWARD = 10;
export const MIN_CARD_SLOTS = 3;
export const MAX_CARD_SLOTS = 30;

/** Validity choices offered in the Pro app (backend accepts 30–730 days). */
export const STAMP_VALIDITY_PRESETS = [30, 60, 90, 180, 365] as const;
export const DEFAULT_STAMP_VALIDITY_DAYS = 90;

/**
 * Value after a stampsForReward change. Must stay identical to the backend
 * rescale: ROUND(value * newRef / oldRef), floored at `min`.
 */
export function rescaleStamps(value: number, oldRef: number, newRef: number, min = 1): number {
  if (!(oldRef > 0) || !(newRef > 0) || oldRef === newRef) return value;
  return Math.max(Math.round((value * newRef) / oldRef), min);
}

/** Slots on the client card: the cheapest reward, else stampsForReward. */
export function cardSlots(rewardCosts: number[], stampsForReward: number): number {
  return rewardCosts.length > 0 ? Math.min(...rewardCosts) : stampsForReward;
}
