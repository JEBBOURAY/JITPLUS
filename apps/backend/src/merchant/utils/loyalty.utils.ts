import { DEFAULT_STAMPS_FOR_REWARD, MAX_STAMPS_PER_TX } from '../../common/constants';

/** Determine reward threshold from merchant settings */
export function computeRewardThreshold(
  merchant: { stampsForReward: number | null; rewards?: { cout: number }[] } | null,
): number {
  if (merchant?.rewards && merchant.rewards.length > 0) {
    return Math.min(...merchant.rewards.map(r => r.cout));
  }
  return merchant?.stampsForReward || DEFAULT_STAMPS_FOR_REWARD;
}

/**
 * Stamps earned for a purchase in PER_AMOUNT mode: one stamp per full
 * `amountPerStamp`, capped at MAX_STAMPS_PER_TX. Returns 0 when the amount
 * does not cover a single stamp. The mobile apps compute the same value, so
 * any change here must be mirrored there.
 */
export function computeEarnedStamps(amount: number, amountPerStamp: number): number {
  if (!(amount > 0) || !(amountPerStamp > 0)) return 0;
  return Math.min(Math.floor(amount / amountPerStamp), MAX_STAMPS_PER_TX);
}

const DAY_MS = 86_400_000;

/**
 * Date at which a card's stamps are reset under the merchant's validity rule,
 * or null when stamps never expire. The countdown starts at the later of the
 * last visit and the last change of the rule.
 */
export function computeStampsExpiry(
  lastVisitAt: Date,
  stampValidityDays: number | null | undefined,
  stampValiditySince: Date | null | undefined,
): Date | null {
  if (!stampValidityDays || stampValidityDays <= 0) return null;
  const start = stampValiditySince && stampValiditySince > lastVisitAt ? stampValiditySince : lastVisitAt;
  return new Date(start.getTime() + stampValidityDays * DAY_MS);
}
