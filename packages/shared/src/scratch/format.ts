// ── Scratch cards & coupons — pure formatting helpers (no React Native) ──────
import { ALL_WEEKDAYS_MASK, COUPON_CODE_LENGTH, WEEKDAY_BITS } from './constants';
import type { CouponConditions, CouponRewardType } from './types';

/** Translator compatible with i18n-js `t(key, params)` */
export type ScratchTranslate = (key: string, params?: Record<string, unknown>) => string;

/** '042913' → '042 913' */
export function formatCouponCode(code: string): string {
  const digits = normalizeCouponCode(code);
  return digits.length === COUPON_CODE_LENGTH ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Keeps digits only, at most 6 (for the cashier input) */
export function normalizeCouponCode(input: string): string {
  return (input || '').replace(/\D/g, '').slice(0, COUPON_CODE_LENGTH);
}

export function isCompleteCouponCode(input: string): boolean {
  return normalizeCouponCode(input).length === COUPON_CODE_LENGTH;
}

/** Bitmask → ISO weekdays (1 = Monday … 7 = Sunday) */
export function weekdaysFromMask(mask: number | null | undefined): number[] {
  if (mask == null) return [1, 2, 3, 4, 5, 6, 7];
  return WEEKDAY_BITS.flatMap((bit, i) => ((mask & bit) !== 0 ? [i + 1] : []));
}

/** ISO weekdays → bitmask (null when every day is selected) */
export function maskFromWeekdays(days: number[]): number | null {
  const mask = days.reduce((m, d) => (d >= 1 && d <= 7 ? m | WEEKDAY_BITS[d - 1] : m), 0);
  return mask === ALL_WEEKDAYS_MASK ? null : mask;
}

/** 600 → '10:00' */
export function minutesToTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** '10:30' → 630, invalid → null */
export function timeToMinutes(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((value || '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Discount granted on a ticket. Indicative on the apps — the backend computes
 * the authoritative amount with the same rule.
 */
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

/** Initial probability (%) of each reward from its weight */
export function rewardProbabilities(weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w || 0), 0);
  if (total <= 0) return weights.map(() => 0);
  return weights.map((w) => Math.round((Math.max(0, w || 0) / total) * 1000) / 10);
}

/**
 * Expected number of each reward if every recipient scratches, and whether the
 * stock runs out before that.
 */
export function expectedRewardCounts(
  recipients: number,
  rewards: { weight: number; totalStock?: number | null }[],
): { expected: number; stockShort: boolean }[] {
  const total = rewards.reduce((s, r) => s + Math.max(0, r.weight || 0), 0);
  return rewards.map((r) => {
    const expected = total > 0 ? Math.round((recipients * Math.max(0, r.weight || 0)) / total) : 0;
    return { expected, stockShort: r.totalStock != null && r.totalStock < expected };
  });
}

/** '-20 %', '-30 MAD', 'Café offert', '+5 tampons' */
export function formatRewardValue(
  reward: { type: CouponRewardType; value?: number | null; label: string },
  t: ScratchTranslate,
): string {
  switch (reward.type) {
    case 'PERCENT_DISCOUNT':
      return t('scratch.rewardValue.percent', { value: reward.value ?? 0 });
    case 'FIXED_DISCOUNT':
      return t('scratch.rewardValue.fixed', { value: reward.value ?? 0 });
    case 'BONUS_STAMPS':
      return t('scratch.rewardValue.bonusStamps', { count: reward.value ?? 0, value: reward.value ?? 0 });
    default:
      return reward.label;
  }
}

/**
 * What the card shows: the value as headline ("-20 %") and the merchant's
 * label underneath when it adds information ("-20 % sur l'addition").
 */
export function rewardDisplay(
  reward: { type: CouponRewardType; value?: number | null; label: string },
  t: ScratchTranslate,
): { headline: string; detail: string | null } {
  const headline = formatRewardValue(reward, t);
  const label = reward.label.trim();
  const detail = reward.type !== 'FREE_PRODUCT' && label && label !== headline ? label : null;
  return { headline, detail };
}

/**
 * Human-readable usage conditions, one line each.
 * `formatDate` receives an ISO string and returns a short local date.
 */
export function describeCouponConditions(
  coupon: { conditions?: CouponConditions | null; validFrom?: string | null; expiresAt?: string | null },
  t: ScratchTranslate,
  formatDate: (iso: string) => string,
  now: Date = new Date(),
): string[] {
  const c = coupon.conditions ?? {};
  const lines: string[] = [];
  if (c.minPurchaseAmount != null && c.minPurchaseAmount > 0) {
    lines.push(t('scratch.conditions.minPurchase', { amount: c.minPurchaseAmount }));
  }
  if (c.allowedWeekdays != null) {
    const days = weekdaysFromMask(c.allowedWeekdays).map((d) => t(`scratch.weekdayShort.${d}`));
    lines.push(t('scratch.conditions.weekdays', { days: days.join(', ') }));
  }
  if (c.allowedFromMin != null && c.allowedToMin != null) {
    lines.push(t('scratch.conditions.hours', { from: minutesToTime(c.allowedFromMin), to: minutesToTime(c.allowedToMin) }));
  }
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now.getTime()) {
    lines.push(t('scratch.conditions.validFrom', { date: formatDate(coupon.validFrom) }));
  }
  if (coupon.expiresAt) {
    lines.push(t('scratch.conditions.expiresAt', { date: formatDate(coupon.expiresAt) }));
  }
  lines.push(t('scratch.conditions.singleUse'));
  return lines;
}

/** YYYY-MM-DD of a local date */
export function toYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return toYmd(new Date(y, m - 1, d + days));
}

export function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Whole days from `fromYmd` to `toYmd` (negative when to < from) */
export function diffDaysYmd(fromYmd: string, toYmdValue: string): number {
  const [y1, m1, d1] = fromYmd.split('-').map(Number);
  const [y2, m2, d2] = toYmdValue.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
