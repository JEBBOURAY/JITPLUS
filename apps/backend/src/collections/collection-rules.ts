import { BadRequestException, ConflictException } from '@nestjs/common';
import { MS_PER_DAY } from '../common/constants';
import { endOfMoroccoDay, isValidYmd, moroccoYmd } from '../common/utils/morocco-time';
import { computeCouponValidFrom } from '../scratch-card/coupon-rules';

export const COLLECTION_LIMITS = {
  /** Items to buy. The gift comes on top ("le 6e offert" = 5 items + the gift). */
  MIN_ITEMS: 2,
  MAX_ITEMS: 8,
  NAME_MAX: 80,
  LABEL_MAX: 60,
  GIFT_MAX: 80,
  DEFAULT_COUPON_DAYS: 30,
  MAX_COUPON_DAYS: 120,
  MAX_GIFT_DELAY_HOURS: 168,
  /** Collections (any status) kept per merchant. */
  MAX_PER_MERCHANT: 50,
} as const;

/** Uploaded with type=collection (stored under collections/<merchantId>/): the only photos a collection may use, since they are deleted with it. */
export function isCollectionImage(url: string, merchantId: string): boolean {
  return url.includes(`/collections/${merchantId}/`);
}

/** Trims the labels and rejects an empty or duplicated one (case-insensitive). */
export function normalizeItemLabels(labels: string[]): string[] {
  const clean = labels.map((l) => l.trim().replace(/\s+/g, ' '));
  if (clean.some((l) => l.length === 0)) throw new BadRequestException('error.collection.itemLabelRequired');
  const seen = new Set(clean.map((l) => l.toLocaleLowerCase()));
  if (seen.size !== clean.length) throw new BadRequestException('error.collection.duplicateItems');
  return clean;
}

/** End of the chosen day in Morocco, or null when the collection has no end date. */
export function resolveEndsAt(endsOn: string | null | undefined, now: Date): Date | null {
  if (!endsOn) return null;
  if (!isValidYmd(endsOn)) throw new BadRequestException('error.collection.endDateInvalid');
  const endsAt = endOfMoroccoDay(endsOn);
  if (endsAt.getTime() <= now.getTime()) throw new BadRequestException('error.collection.endDatePast');
  return endsAt;
}

/** A collection is open for ticking while ACTIVE and before its end date. */
export function isCollectionOpen(c: { status: string; endsAt: Date | null }, now: Date): boolean {
  return c.status === 'ACTIVE' && (!c.endsAt || c.endsAt.getTime() > now.getTime());
}

export interface CheckPlan {
  /** Requested items not ticked yet, in the order of the collection. */
  newItemIds: string[];
  /** Every item is ticked once `newItemIds` are added. */
  completes: boolean;
}

/**
 * Decides what a till request ticks. Items already ticked are ignored (a retry
 * is a no-op). With `onePerVisit`, a client gets one new item per Morocco day.
 */
export function planChecks(p: {
  itemIds: string[];
  checked: { itemId: string; createdAt: Date }[];
  requested: string[];
  onePerVisit: boolean;
  now: Date;
}): CheckPlan {
  const known = new Set(p.itemIds);
  if (p.requested.some((id) => !known.has(id))) throw new BadRequestException('error.collection.invalidItems');

  const done = new Set(p.checked.map((c) => c.itemId));
  const wanted = new Set(p.requested);
  const newItemIds = p.itemIds.filter((id) => wanted.has(id) && !done.has(id));

  if (p.onePerVisit && newItemIds.length > 0) {
    const today = moroccoYmd(p.now);
    const tickedToday = p.checked.some((c) => moroccoYmd(c.createdAt) === today);
    if (newItemIds.length > 1 || tickedToday) throw new ConflictException('error.collection.onePerVisit');
  }

  return { newItemIds, completes: done.size + newItemIds.length === p.itemIds.length };
}

/** Validity window of the gift coupon. */
export function giftCouponDates(c: { couponValidityDays: number; giftDelayHours: number }, now: Date) {
  const expiresAt = new Date(now.getTime() + c.couponValidityDays * MS_PER_DAY);
  return { validFrom: computeCouponValidFrom(now, c.giftDelayHours, expiresAt), expiresAt };
}
