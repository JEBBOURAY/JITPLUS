import { BadRequestException, ConflictException } from '@nestjs/common';
import { giftCouponDates, isCollectionOpen, normalizeItemLabels, planChecks, resolveEndsAt } from './collection-rules';

const NOW = new Date('2026-11-21T12:00:00Z');
const YESTERDAY = new Date('2026-11-20T12:00:00Z');
const ITEMS = ['a', 'b', 'c'];
const tick = (itemId: string, createdAt = YESTERDAY) => ({ itemId, createdAt });

describe('normalizeItemLabels', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeItemLabels(['  Espresso ', 'Jus   d\'orange'])).toEqual(['Espresso', 'Jus d\'orange']);
  });
  it('rejects an empty label', () => {
    expect(() => normalizeItemLabels(['Espresso', '   '])).toThrow(BadRequestException);
  });
  it('rejects duplicates whatever the case', () => {
    expect(() => normalizeItemLabels(['Mojito', 'mojito'])).toThrow('error.collection.duplicateItems');
  });
});

describe('resolveEndsAt', () => {
  it('returns null without an end date', () => {
    expect(resolveEndsAt(null, NOW)).toBeNull();
    expect(resolveEndsAt(undefined, NOW)).toBeNull();
  });
  it('ends at the end of the chosen day', () => {
    const endsAt = resolveEndsAt('2026-11-21', NOW)!;
    expect(endsAt.getTime()).toBeGreaterThan(NOW.getTime());
  });
  it('rejects a past or malformed date', () => {
    expect(() => resolveEndsAt('2026-11-20', NOW)).toThrow('error.collection.endDatePast');
    expect(() => resolveEndsAt('2026-13-40', NOW)).toThrow('error.collection.endDateInvalid');
  });
});

describe('isCollectionOpen', () => {
  it('is open while ACTIVE and before its end', () => {
    expect(isCollectionOpen({ status: 'ACTIVE', endsAt: null }, NOW)).toBe(true);
    expect(isCollectionOpen({ status: 'ACTIVE', endsAt: YESTERDAY }, NOW)).toBe(false);
    expect(isCollectionOpen({ status: 'DRAFT', endsAt: null }, NOW)).toBe(false);
    expect(isCollectionOpen({ status: 'ENDED', endsAt: null }, NOW)).toBe(false);
  });
});

describe('planChecks', () => {
  const base = { itemIds: ITEMS, onePerVisit: false, now: NOW };

  it('ticks the requested items in collection order', () => {
    expect(planChecks({ ...base, checked: [], requested: ['c', 'a'] })).toEqual({ newItemIds: ['a', 'c'], completes: false });
  });
  it('ignores items already ticked (retry is a no-op)', () => {
    expect(planChecks({ ...base, checked: [tick('a')], requested: ['a'] })).toEqual({ newItemIds: [], completes: false });
  });
  it('completes when the last item is ticked', () => {
    expect(planChecks({ ...base, checked: [tick('a'), tick('b')], requested: ['c'] })).toEqual({ newItemIds: ['c'], completes: true });
  });
  it('can complete in one visit when several items are allowed', () => {
    expect(planChecks({ ...base, checked: [], requested: ITEMS }).completes).toBe(true);
  });
  it('rejects an item of another collection', () => {
    expect(() => planChecks({ ...base, checked: [], requested: ['a', 'zzz'] })).toThrow(BadRequestException);
  });

  describe('one per visit', () => {
    const one = { ...base, onePerVisit: true };
    it('accepts one new item when nothing was ticked today', () => {
      expect(planChecks({ ...one, checked: [tick('a')], requested: ['b'] }).newItemIds).toEqual(['b']);
    });
    it('rejects two new items at once', () => {
      expect(() => planChecks({ ...one, checked: [], requested: ['a', 'b'] })).toThrow(ConflictException);
    });
    it('rejects a second item the same day', () => {
      expect(() => planChecks({ ...one, checked: [tick('a', NOW)], requested: ['b'] })).toThrow('error.collection.onePerVisit');
    });
    it('still treats a retry of today\'s item as a no-op', () => {
      expect(planChecks({ ...one, checked: [tick('a', NOW)], requested: ['a'] }).newItemIds).toEqual([]);
    });
  });
});

describe('giftCouponDates', () => {
  it('is usable at once by default and expires after the validity', () => {
    const d = giftCouponDates({ couponValidityDays: 30, giftDelayHours: 0 }, NOW);
    expect(d.validFrom).toEqual(NOW);
    expect(d.expiresAt.getTime() - NOW.getTime()).toBe(30 * 86_400_000);
  });
  it('delays the gift to a next visit', () => {
    const d = giftCouponDates({ couponValidityDays: 30, giftDelayHours: 12 }, NOW);
    expect(d.validFrom.getTime() - NOW.getTime()).toBe(12 * 3_600_000);
  });
  it('never starts after it expires', () => {
    const d = giftCouponDates({ couponValidityDays: 1, giftDelayHours: 48 }, NOW);
    expect(d.validFrom).toEqual(NOW);
  });
});
