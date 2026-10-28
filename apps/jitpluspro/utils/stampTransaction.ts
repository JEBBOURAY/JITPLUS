import { MAX_AMOUNT_DIGITS } from '@/constants/app';
import { computeStampsForAmount } from '@/utils/stamps';

export type EarningMode = 'PER_VISIT' | 'PER_AMOUNT';

export interface StampPlanInput {
  mode: EarningMode;
  currentStamps: number;
  /** Parsed purchase amount, 0 when empty. */
  amount: number;
  /** PER_VISIT only: whether this visit earns its stamp. */
  countVisit: boolean;
  amountPerStamp?: number | null;
  accumulationLimit?: number | null;
  reward?: { cout: number } | null;
}

type StampPlanBlocker =
  | 'enterAmount'
  | 'amountTooLow'
  | 'limitReached'
  | 'rewardTooExpensive'
  | 'nothingSelected';

export interface StampPlan {
  kind: 'earn' | 'earnAndRedeem' | 'redeem' | 'none';
  /**
   * A reward the client can already afford is redeemed first, so the
   * accumulation limit applies to the lowered balance and no stamp is lost.
   */
  order: 'redeemFirst' | 'earnFirst';
  /** Stamps sent with EARN_STAMPS (backend rule), 0 = no earn transaction. */
  earnStamps: number;
  /** Stamps the card really gains once the accumulation limit is applied. */
  creditedStamps: number;
  /** PER_AMOUNT purchase above MAX_STAMPS_PER_TX. */
  perTxCapped: boolean;
  /** The accumulation limit reduced the credit. */
  limitTrimmed: boolean;
  /** The card is at the accumulation limit: the backend refuses any earn. */
  atLimit: boolean;
  /** PER_AMOUNT amount typed but below the price of one stamp. */
  amountTooLow: boolean;
  balanceAfter: number;
  blocker: StampPlanBlocker | null;
}

/**
 * What one validation will do. Mirrors the backend rules of
 * POST /merchant/transactions so the button never promises something the
 * server refuses.
 */
export function computeStampPlan(input: StampPlanInput): StampPlan {
  const current = Math.max(0, input.currentStamps || 0);
  const limit = input.accumulationLimit ?? null;
  const reward = input.reward ?? null;
  const isPerAmount = input.mode === 'PER_AMOUNT';

  const perAmount = isPerAmount ? computeStampsForAmount(input.amount, input.amountPerStamp) : null;
  const rawEarn = isPerAmount ? perAmount!.stamps : input.countVisit ? 1 : 0;
  const amountTooLow = isPerAmount && input.amount > 0 && rawEarn === 0;

  const redeemFirst = !!reward && current >= reward.cout;
  const base = redeemFirst ? current - reward!.cout : current;
  const atLimit = limit != null && base >= limit;
  const earnStamps = atLimit ? 0 : rawEarn;
  const creditedStamps = limit != null ? Math.max(0, Math.min(earnStamps, limit - base)) : earnStamps;
  const afterEarn = base + creditedStamps;

  let blocker: StampPlanBlocker | null = null;
  let redeem = false;
  let balanceAfter = afterEarn;
  if (reward) {
    if (redeemFirst) {
      redeem = true;
    } else if (afterEarn >= reward.cout) {
      redeem = true;
      balanceAfter = afterEarn - reward.cout;
    } else {
      blocker = 'rewardTooExpensive';
      balanceAfter = afterEarn;
    }
  }

  const earn = earnStamps > 0;
  const kind: StampPlan['kind'] =
    blocker ? 'none' : earn && redeem ? 'earnAndRedeem' : earn ? 'earn' : redeem ? 'redeem' : 'none';

  if (kind === 'none' && !blocker) {
    if (atLimit && rawEarn > 0) blocker = 'limitReached';
    else if (amountTooLow) blocker = 'amountTooLow';
    else if (isPerAmount) blocker = atLimit ? 'limitReached' : 'enterAmount';
    else blocker = atLimit ? 'limitReached' : 'nothingSelected';
  }

  return {
    kind,
    order: redeemFirst ? 'redeemFirst' : 'earnFirst',
    earnStamps,
    creditedStamps,
    perTxCapped: !!perAmount?.capped && !atLimit,
    limitTrimmed: creditedStamps < earnStamps,
    atLimit,
    amountTooLow,
    balanceAfter,
    blocker,
  };
}

export type RewardAvailability =
  | { state: 'now' }
  | { state: 'afterPurchase' }
  | { state: 'missing'; missing: number };

/** Whether a reward can be offered now, with the stamps of this purchase, or later. */
export function rewardAvailability(cout: number, currentStamps: number, stampsAfterPurchase: number): RewardAvailability {
  if (currentStamps >= cout) return { state: 'now' };
  if (stampsAfterPurchase >= cout) return { state: 'afterPurchase' };
  return { state: 'missing', missing: cout - stampsAfterPurchase };
}

/**
 * Normalises a typed amount: comma or dot as decimal separator, 2 decimals,
 * no sign. Returns null when the keystroke must be ignored.
 */
export function sanitizeAmountInput(text: string): string | null {
  if (text.trim().startsWith('-')) return null;
  const parts = text.replace(/,/g, '.').replace(/[^0-9.]/g, '').split('.');
  let formatted = parts[0] || '';
  if (parts.length > 1) formatted += '.' + (parts.slice(1).join('').slice(0, 2));
  return formatted.length <= MAX_AMOUNT_DIGITS ? formatted : null;
}

export function parseAmount(text: string): number {
  const value = parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function initials(prenom?: string | null, nom?: string | null): string {
  const letters = [prenom, nom]
    .map((part) => (part ?? '').trim().charAt(0))
    .filter(Boolean)
    .join('');
  return letters.toUpperCase() || '?';
}
