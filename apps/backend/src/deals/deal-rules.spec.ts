import { BadRequestException } from '@nestjs/common';
import {
  addDaysYmd,
  dealDisplayStatus,
  normalizeDealLink,
  normalizeOffer,
  normalizeTitleKey,
  resolveDealDates,
  resolveExtendedEnd,
} from './deal-rules';

describe('normalizeOffer', () => {
  it('keeps only the percentage of a PERCENT_OFF deal', () => {
    expect(normalizeOffer({ type: 'PERCENT_OFF', percentOff: 30, originalPrice: 100, buyQty: 2 })).toEqual({
      type: 'PERCENT_OFF',
      originalPrice: null,
      dealPrice: null,
      percentOff: 30,
      buyQty: null,
      freeQty: null,
    });
  });

  it.each([0, 100, 12.5, null])('rejects a percentage of %p', (percentOff) => {
    expect(() => normalizeOffer({ type: 'PERCENT_OFF', percentOff })).toThrow(BadRequestException);
  });

  it('computes the discount of a price drop', () => {
    expect(normalizeOffer({ type: 'PRICE_DROP', originalPrice: 1140, dealPrice: 799 })).toMatchObject({
      originalPrice: 1140,
      dealPrice: 799,
      percentOff: 30,
    });
  });

  it('rounds prices to cents', () => {
    expect(normalizeOffer({ type: 'PRICE_DROP', originalPrice: 10.005, dealPrice: 5.333 })).toMatchObject({
      originalPrice: 10.01,
      dealPrice: 5.33,
    });
  });

  it('rejects a promo price that is not lower', () => {
    expect(() => normalizeOffer({ type: 'PRICE_DROP', originalPrice: 100, dealPrice: 100 })).toThrow(BadRequestException);
    expect(() => normalizeOffer({ type: 'PRICE_DROP', originalPrice: 100 })).toThrow(BadRequestException);
  });

  it('needs both quantities for BUY_X_GET_Y', () => {
    expect(normalizeOffer({ type: 'BUY_X_GET_Y', buyQty: 1, freeQty: 1 })).toMatchObject({ buyQty: 1, freeQty: 1 });
    expect(() => normalizeOffer({ type: 'BUY_X_GET_Y', buyQty: 1 })).toThrow(BadRequestException);
    expect(() => normalizeOffer({ type: 'BUY_X_GET_Y', buyQty: 21, freeQty: 1 })).toThrow(BadRequestException);
  });

  it('clears every value of OTHER', () => {
    expect(normalizeOffer({ type: 'OTHER', percentOff: 10, dealPrice: 5 })).toMatchObject({ percentOff: null, dealPrice: null });
  });
});

describe('normalizeDealLink', () => {
  it('returns null for an empty optional link', () => {
    expect(normalizeDealLink('  ', false)).toBeNull();
    expect(normalizeDealLink(undefined, false)).toBeNull();
  });

  it('requires a link for ONLINE deals', () => {
    expect(() => normalizeDealLink('', true)).toThrow(BadRequestException);
  });

  it('accepts a normal https link', () => {
    expect(normalizeDealLink(' https://modashop.ma/promo?x=1 ', true)).toBe('https://modashop.ma/promo?x=1');
  });

  it.each([
    'http://modashop.ma',
    'javascript:alert(1)',
    'https://user:pass@modashop.ma',
    'https://192.168.1.1/admin',
    'https://localhost/x',
    'https://bit.ly/abc',
    'https://www.tinyurl.com/abc',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => normalizeDealLink(url, true)).toThrow(BadRequestException);
  });
});

describe('resolveDealDates (Morocco time)', () => {
  // Thursday 15 Oct 2026, 10:00 UTC = 11:00 in Morocco
  const now = new Date('2026-10-15T10:00:00.000Z');

  it('starts immediately when the first day is today', () => {
    const dates = resolveDealDates(null, '2026-10-21', now);
    expect(dates.startsAt).toBe(now);
    expect(dates.endsAt.toISOString()).toBe('2026-10-21T22:59:59.999Z');
  });

  it('starts at midnight Morocco time on a later day', () => {
    expect(resolveDealDates('2026-10-20', '2026-10-21', now).startsAt.toISOString()).toBe('2026-10-19T23:00:00.000Z');
  });

  it('accepts a one-day deal ending tonight', () => {
    expect(resolveDealDates(null, '2026-10-15', now).endsAt.toISOString()).toBe('2026-10-15T22:59:59.999Z');
  });

  it.each<[string | null, string, string]>([
    ['2026-10-14', '2026-10-20', 'past start'],
    [null, '2026-10-14', 'end before start'],
    [null, addDaysYmd('2026-10-15', 31), 'too long'],
    [addDaysYmd('2026-10-15', 31), addDaysYmd('2026-10-15', 32), 'too far ahead'],
    ['2026-02-30', '2026-03-02', 'invalid date'],
  ])('rejects %s → %s (%s)', (start, end) => {
    expect(() => resolveDealDates(start, end, now)).toThrow(BadRequestException);
  });

  it('accepts exactly the maximum length and horizon', () => {
    expect(() => resolveDealDates(null, addDaysYmd('2026-10-15', 30), now)).not.toThrow();
    const start = addDaysYmd('2026-10-15', 30);
    expect(() => resolveDealDates(start, addDaysYmd(start, 30), now)).not.toThrow();
  });
});

describe('resolveExtendedEnd', () => {
  const now = new Date('2026-10-15T10:00:00.000Z');

  it('extends up to 30 days from today', () => {
    expect(resolveExtendedEnd(addDaysYmd('2026-10-15', 30), now).toISOString()).toBe('2026-11-14T22:59:59.999Z');
    expect(() => resolveExtendedEnd(addDaysYmd('2026-10-15', 31), now)).toThrow(BadRequestException);
    expect(() => resolveExtendedEnd('2026-10-14', now)).toThrow(BadRequestException);
  });
});

describe('dealDisplayStatus', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  const base = { startsAt: new Date('2026-10-10T00:00:00Z'), endsAt: new Date('2026-10-20T00:00:00Z') };

  it.each([
    [{ ...base, status: 'ACTIVE' }, 'LIVE'],
    [{ ...base, status: 'ACTIVE', startsAt: new Date('2026-10-16T00:00:00Z') }, 'SCHEDULED'],
    [{ ...base, status: 'ACTIVE', endsAt: new Date('2026-10-15T09:00:00Z') }, 'ENDED'],
    [{ ...base, status: 'ENDED' }, 'ENDED'],
    [{ ...base, status: 'REMOVED' }, 'REMOVED'],
  ])('%o → %s', (deal, expected) => {
    expect(dealDisplayStatus(deal, now)).toBe(expected);
  });
});

describe('normalizeTitleKey', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeTitleKey('  -30 % sur les Baskets !')).toBe(normalizeTitleKey('-30% SUR LES BASKETS'));
    expect(normalizeTitleKey('Café offert')).toBe('cafe offert');
  });
});
