import {
  capStampsToLimit,
  computeCouponDiscount,
  computeCouponValidFrom,
  computePurchaseStamps,
  evaluateCouponConditions,
  isWithinTimeWindow,
  parseCouponConditions,
  type EvaluableCoupon,
} from './coupon-rules';
import { computeEarnedStamps } from '../merchant/utils/loyalty.utils';

// Thursday 15 Jan 2026, 12:00 UTC = 13:00 Morocco
const NOW = new Date('2026-01-15T12:00:00Z');

function coupon(overrides: Partial<EvaluableCoupon> = {}): EvaluableCoupon {
  return {
    status: 'ACTIVE',
    validFrom: new Date('2026-01-10T00:00:00Z'),
    expiresAt: new Date('2026-01-20T22:59:59Z'),
    conditions: {},
    ...overrides,
  };
}

const keyResult = (checks: { key: string; ok: boolean | null }[], key: string) => checks.find((c) => c.key === key)?.ok;

describe('evaluateCouponConditions', () => {
  it('accepts a plain active coupon', () => {
    const { checks, canRedeem } = evaluateCouponConditions(coupon(), NOW);
    expect(canRedeem).toBe(true);
    expect(checks.map((c) => c.key)).toEqual(['status', 'dates']);
  });

  it('treats a past expiry as expired even before the cron runs', () => {
    const { checks, canRedeem } = evaluateCouponConditions(coupon({ expiresAt: new Date('2026-01-15T11:00:00Z') }), NOW);
    expect(canRedeem).toBe(false);
    expect(checks[0].detail?.status).toBe('EXPIRED');
  });

  it('refuses cancelled and redeemed coupons', () => {
    expect(evaluateCouponConditions(coupon({ status: 'CANCELLED' }), NOW).canRedeem).toBe(false);
    expect(evaluateCouponConditions(coupon({ status: 'REDEEMED' }), NOW).canRedeem).toBe(false);
  });

  it('refuses a coupon not usable yet (next-visit delay)', () => {
    const res = evaluateCouponConditions(coupon({ validFrom: new Date('2026-01-16T00:00:00Z') }), NOW);
    expect(keyResult(res.checks, 'dates')).toBe(false);
    expect(res.canRedeem).toBe(false);
  });

  it('checks the weekday in Morocco time', () => {
    const thursday = 8; // bit of ISO day 4
    expect(evaluateCouponConditions(coupon({ conditions: { allowedWeekdays: thursday } }), NOW).canRedeem).toBe(true);
    expect(evaluateCouponConditions(coupon({ conditions: { allowedWeekdays: 1 | 2 } }), NOW).canRedeem).toBe(false);
    // 23:30 UTC on Thursday is already Friday 00:30 in Morocco
    const lateThursdayUtc = new Date('2026-01-15T23:30:00Z');
    expect(evaluateCouponConditions(coupon({ conditions: { allowedWeekdays: 16 } }), lateThursdayUtc).canRedeem).toBe(true);
  });

  it('checks the time window, including windows crossing midnight', () => {
    const lunch = { allowedFromMin: 12 * 60, allowedToMin: 15 * 60 };
    expect(evaluateCouponConditions(coupon({ conditions: lunch }), NOW).canRedeem).toBe(true);
    const morning = { allowedFromMin: 8 * 60, allowedToMin: 11 * 60 };
    expect(evaluateCouponConditions(coupon({ conditions: morning }), NOW).canRedeem).toBe(false);
    expect(isWithinTimeWindow(23 * 60, 22 * 60, 2 * 60)).toBe(true);
    expect(isWithinTimeWindow(60, 22 * 60, 2 * 60)).toBe(true);
    expect(isWithinTimeWindow(3 * 60, 22 * 60, 2 * 60)).toBe(false);
  });

  it('leaves the minimum purchase undecided until an amount is given', () => {
    const c = coupon({ conditions: { minPurchaseAmount: 100 } });
    const pending = evaluateCouponConditions(c, NOW);
    expect(keyResult(pending.checks, 'minPurchase')).toBeNull();
    expect(pending.canRedeem).toBe(true);
    expect(evaluateCouponConditions(c, NOW, 99).canRedeem).toBe(false);
    expect(evaluateCouponConditions(c, NOW, 100).canRedeem).toBe(true);
  });

  it('ignores malformed JSON conditions', () => {
    expect(parseCouponConditions('oops')).toEqual({
      minPurchaseAmount: null,
      allowedWeekdays: null,
      allowedFromMin: null,
      allowedToMin: null,
    });
  });
});

describe('computeCouponDiscount', () => {
  it('applies percentages with the cap', () => {
    expect(computeCouponDiscount({ type: 'PERCENT_DISCOUNT', value: 20 }, 180)).toBe(36);
    expect(computeCouponDiscount({ type: 'PERCENT_DISCOUNT', value: 20, maxDiscount: 30 }, 180)).toBe(30);
  });

  it('never exceeds the ticket', () => {
    expect(computeCouponDiscount({ type: 'FIXED_DISCOUNT', value: 50 }, 30)).toBe(30);
    expect(computeCouponDiscount({ type: 'PERCENT_DISCOUNT', value: 100 }, 42.5)).toBe(42.5);
  });

  it('gives no money discount for products and bonus stamps', () => {
    expect(computeCouponDiscount({ type: 'FREE_PRODUCT' }, 100)).toBe(0);
    expect(computeCouponDiscount({ type: 'BONUS_STAMPS', value: 5 }, 100)).toBe(0);
  });
});

describe('stamps on a coupon purchase', () => {
  const perAmount = { stampEarningMode: 'PER_AMOUNT', amountPerStamp: 10 };
  const perVisit = { stampEarningMode: 'PER_VISIT', amountPerStamp: null };

  it('counts stamps on the amount actually paid (after discount)', () => {
    // 180 MAD ticket, -20 % → 144 paid → 14 stamps
    expect(computePurchaseStamps(perAmount, 144, 180, computeEarnedStamps, 10)).toBe(14);
  });

  it('gives one stamp per visit in PER_VISIT mode, none without purchase', () => {
    expect(computePurchaseStamps(perVisit, 0, 50, computeEarnedStamps, 10)).toBe(1);
    expect(computePurchaseStamps(perVisit, 0, 0, computeEarnedStamps, 10)).toBe(0);
  });

  it('respects the accumulation limit', () => {
    expect(capStampsToLimit(8, 5, 10)).toBe(2);
    expect(capStampsToLimit(10, 5, 10)).toBe(0);
    expect(capStampsToLimit(3, 5, null)).toBe(5);
  });
});

describe('computeCouponValidFrom', () => {
  it('adds the delay but never past the expiry', () => {
    const scratched = new Date('2026-01-15T12:00:00Z');
    expect(computeCouponValidFrom(scratched, 24, new Date('2026-01-20T00:00:00Z')).toISOString()).toBe('2026-01-16T12:00:00.000Z');
    expect(computeCouponValidFrom(scratched, 24, new Date('2026-01-16T00:00:00Z'))).toEqual(scratched);
  });
});
