// Pure rules for coupons (no I/O) — unit-tested in coupon-rules.spec.ts.
// The apps show the same rules from packages/shared/src/scratch/format.ts;
// the backend values are authoritative.
import { moroccoParts } from '../common/utils/morocco-time';

export type CouponRewardType = 'PERCENT_DISCOUNT' | 'FIXED_DISCOUNT' | 'FREE_PRODUCT' | 'BONUS_STAMPS';
export type CouponStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';

export interface CouponConditions {
  minPurchaseAmount?: number | null;
  /** Bitmask Monday=1 … Sunday=64 (null = every day) */
  allowedWeekdays?: number | null;
  /** Minutes since midnight, Morocco time */
  allowedFromMin?: number | null;
  allowedToMin?: number | null;
}

export type CouponCheckKey = 'status' | 'dates' | 'weekday' | 'hours' | 'minPurchase';

export interface CouponCheck {
  key: CouponCheckKey;
  /** null = cannot be decided yet (purchase amount unknown) */
  ok: boolean | null;
  detail?: Record<string, unknown>;
}

export interface EvaluableCoupon {
  status: CouponStatus;
  validFrom: Date;
  expiresAt: Date;
  conditions: unknown;
  redeemedAt?: Date | null;
  cancelledAt?: Date | null;
}

const WEEKDAY_BITS = [1, 2, 4, 8, 16, 32, 64];

function toNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Reads the JSON column defensively (old rows, manual edits). */
export function parseCouponConditions(raw: unknown): CouponConditions {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    minPurchaseAmount: toNumberOrNull(obj.minPurchaseAmount),
    allowedWeekdays: toNumberOrNull(obj.allowedWeekdays),
    allowedFromMin: toNumberOrNull(obj.allowedFromMin),
    allowedToMin: toNumberOrNull(obj.allowedToMin),
  };
}

export function weekdaysFromMask(mask: number): number[] {
  return WEEKDAY_BITS.flatMap((bit, i) => ((mask & bit) !== 0 ? [i + 1] : []));
}

/** Time window check; a window crossing midnight (22:00 → 02:00) is supported. */
export function isWithinTimeWindow(minutes: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return true;
  if (fromMin < toMin) return minutes >= fromMin && minutes < toMin;
  return minutes >= fromMin || minutes < toMin;
}

/**
 * Evaluates every usage condition of a coupon at `now` (Morocco wall clock).
 * `purchaseAmount` undefined → the minimum-purchase check is left undecided.
 */
export function evaluateCouponConditions(
  coupon: EvaluableCoupon,
  now: Date,
  purchaseAmount?: number | null,
): { checks: CouponCheck[]; canRedeem: boolean } {
  const c = parseCouponConditions(coupon.conditions);
  const checks: CouponCheck[] = [];

  const effectiveStatus: CouponStatus =
    coupon.status === 'ACTIVE' && coupon.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : coupon.status;
  checks.push({
    key: 'status',
    ok: effectiveStatus === 'ACTIVE',
    detail: {
      status: effectiveStatus,
      ...(coupon.redeemedAt ? { redeemedAt: coupon.redeemedAt.toISOString() } : {}),
      ...(coupon.cancelledAt ? { cancelledAt: coupon.cancelledAt.toISOString() } : {}),
    },
  });

  const started = coupon.validFrom.getTime() <= now.getTime();
  const notExpired = coupon.expiresAt.getTime() > now.getTime();
  checks.push({
    key: 'dates',
    ok: started && notExpired,
    detail: { validFrom: coupon.validFrom.toISOString(), expiresAt: coupon.expiresAt.toISOString() },
  });

  const parts = moroccoParts(now);

  if (c.allowedWeekdays != null && (c.allowedWeekdays & 127) !== 127) {
    const allowed = weekdaysFromMask(c.allowedWeekdays);
    checks.push({ key: 'weekday', ok: allowed.includes(parts.isoWeekday), detail: { allowed, today: parts.isoWeekday } });
  }

  if (c.allowedFromMin != null && c.allowedToMin != null) {
    checks.push({
      key: 'hours',
      ok: isWithinTimeWindow(parts.minutes, c.allowedFromMin, c.allowedToMin),
      detail: { from: c.allowedFromMin, to: c.allowedToMin, now: parts.minutes },
    });
  }

  if (c.minPurchaseAmount != null && c.minPurchaseAmount > 0) {
    checks.push({
      key: 'minPurchase',
      ok: purchaseAmount == null ? null : purchaseAmount >= c.minPurchaseAmount,
      detail: { min: c.minPurchaseAmount },
    });
  }

  const canRedeem = checks.every((check) => check.ok !== false);
  return { checks, canRedeem };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Discount granted on the ticket — same rule as shared computeCouponDiscount. */
export function computeCouponDiscount(
  reward: { type: CouponRewardType; value?: number | null; maxDiscount?: number | null },
  purchaseAmount: number,
): number {
  const amount = Math.max(0, purchaseAmount || 0);
  if (reward.type === 'PERCENT_DISCOUNT') {
    let discount = (amount * (reward.value ?? 0)) / 100;
    if (reward.maxDiscount != null && reward.maxDiscount > 0) discount = Math.min(discount, reward.maxDiscount);
    return round2(Math.min(discount, amount));
  }
  if (reward.type === 'FIXED_DISCOUNT') return round2(Math.min(reward.value ?? 0, amount));
  return 0;
}

/**
 * Stamps earned by the purchase itself (on the amount actually paid).
 * Mirrors createTransaction: PER_VISIT → 1, PER_AMOUNT → floor(paid / amountPerStamp) capped.
 * A visit with no purchase (paid = 0, typically a free product) earns nothing.
 */
export function computePurchaseStamps(
  merchant: { stampEarningMode: string | null; amountPerStamp: number | null },
  paidAmount: number,
  purchaseAmount: number,
  computeEarned: (amount: number, amountPerStamp: number) => number,
  defaultAmountPerStamp: number,
): number {
  if (!(purchaseAmount > 0)) return 0;
  if (merchant.stampEarningMode === 'PER_AMOUNT') {
    return computeEarned(paidAmount, merchant.amountPerStamp || defaultAmountPerStamp);
  }
  return 1;
}

/** Applies the accumulation limit: how many stamps can actually be added. */
export function capStampsToLimit(currentBalance: number, toAdd: number, limit: number | null | undefined): number {
  if (toAdd <= 0) return 0;
  if (limit == null) return toAdd;
  return Math.max(0, Math.min(toAdd, limit - currentBalance));
}

/** validFrom = scratchedAt + delay, never after expiresAt. */
export function computeCouponValidFrom(scratchedAt: Date, minDelayHours: number, expiresAt: Date): Date {
  const validFrom = new Date(scratchedAt.getTime() + Math.max(0, minDelayHours || 0) * 3_600_000);
  return validFrom.getTime() >= expiresAt.getTime() ? scratchedAt : validFrom;
}
