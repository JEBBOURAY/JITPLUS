import {
  dealBadgeLabel, dealLinkHost, dealPrices, dealStoresByDistance, dealTimeLeftLabel,
  formatDealEndDate, isSafeDealLink,
} from '@/utils/dealVisual';
import type { ClientDealStore } from '@jitplus/shared/src/deals';

// Echoes the key and its params so the tests check which text is picked.
const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

const offer = { originalPrice: null, dealPrice: null, percentOff: null, buyQty: null, freeQty: null };

describe('dealBadgeLabel', () => {
  it('labels each offer type', () => {
    expect(dealBadgeLabel({ ...offer, type: 'PERCENT_OFF', percentOff: 30 }, t)).toBe('deals.badge.percent:{"value":30}');
    expect(dealBadgeLabel({ ...offer, type: 'PRICE_DROP', originalPrice: 100, dealPrice: 75 }, t)).toBe('deals.badge.percent:{"value":25}');
    expect(dealBadgeLabel({ ...offer, type: 'BUY_X_GET_Y', buyQty: 2, freeQty: 1 }, t)).toBe('deals.badge.bogo:{"buy":2,"free":1}');
    expect(dealBadgeLabel({ ...offer, type: 'FREE_ITEM' }, t)).toBe('deals.badge.free');
    expect(dealBadgeLabel({ ...offer, type: 'OTHER' }, t)).toBeNull();
  });
});

describe('dealTimeLeftLabel', () => {
  const now = new Date('2025-06-10T10:00:00Z');
  it('shows days, hours or minutes, urgent under 24 h', () => {
    expect(dealTimeLeftLabel('2025-06-13T11:00:00Z', t, now)).toEqual({ text: 'deals.time.days:{"count":3}', urgent: false, ended: false });
    expect(dealTimeLeftLabel('2025-06-10T15:30:00Z', t, now)).toEqual({ text: 'deals.time.hours:{"count":5}', urgent: true, ended: false });
    expect(dealTimeLeftLabel('2025-06-10T10:00:20Z', t, now)).toEqual({ text: 'deals.time.minutes:{"count":1}', urgent: true, ended: false });
  });

  it('flags ended deals', () => {
    expect(dealTimeLeftLabel('2025-06-10T09:00:00Z', t, now)).toEqual({ text: 'deals.time.ended', urgent: false, ended: true });
  });
});

describe('dealPrices', () => {
  it('gives the promo and struck price of a price drop', () => {
    expect(dealPrices({ ...offer, type: 'PRICE_DROP', originalPrice: 120, dealPrice: 99 }, t, 'fr')).toEqual({
      price: 'deals.price:{"value":"99"}',
      original: 'deals.price:{"value":"120"}',
    });
  });

  it('gives the value of a free item and nothing for other offers', () => {
    expect(dealPrices({ ...offer, type: 'FREE_ITEM', originalPrice: 15 }, t, 'fr')).toEqual({ price: null, original: 'deals.price:{"value":"15"}' });
    expect(dealPrices({ ...offer, type: 'PERCENT_OFF', percentOff: 10 }, t, 'fr')).toEqual({ price: null, original: null });
  });
});

describe('isSafeDealLink / dealLinkHost', () => {
  it('only accepts plain https links', () => {
    expect(isSafeDealLink('https://shop.ma/promo?x=1')).toBe(true);
    expect(isSafeDealLink('https://www.shop.ma')).toBe(true);
    expect(isSafeDealLink('http://shop.ma')).toBe(false);
    expect(isSafeDealLink('javascript:alert(1)')).toBe(false);
    expect(isSafeDealLink('intent://scan#Intent;end')).toBe(false);
    expect(isSafeDealLink('https://bank.ma@evil.com/login')).toBe(false);
    expect(isSafeDealLink('https://shop.ma/a b')).toBe(false);
    expect(isSafeDealLink('https://')).toBe(false);
    expect(isSafeDealLink(null)).toBe(false);
  });

  it('extracts the host shown to the user', () => {
    expect(dealLinkHost('https://www.Shop.ma/promo')).toBe('shop.ma');
    expect(dealLinkHost('https://store.example.com:8443/x')).toBe('store.example.com');
    expect(dealLinkHost('http://shop.ma')).toBeNull();
  });
});

describe('dealStoresByDistance', () => {
  const store = (id: string, extra: Partial<ClientDealStore>): ClientDealStore => ({
    id, nom: id, ville: null, quartier: null, adresse: null, latitude: null, longitude: null, telephone: null, distanceKm: null, ...extra,
  });

  it('keeps server distances, computes missing ones and sorts nearest first', () => {
    const user = { latitude: 33.5731, longitude: -7.5898 };
    const sorted = dealStoresByDistance([
      store('far', { distanceKm: 12 }),
      store('unknown', {}),
      store('near', { latitude: 33.5741, longitude: -7.5898 }),
    ], user);
    expect(sorted.map((s) => s.id)).toEqual(['near', 'far', 'unknown']);
    expect(sorted[0].distanceKm).toBeCloseTo(0.11, 1);
    expect(sorted[2].distanceKm).toBeNull();
  });

  it('handles a missing list or position', () => {
    expect(dealStoresByDistance(undefined, null)).toEqual([]);
    expect(dealStoresByDistance([store('a', { latitude: 1, longitude: 1 })], null)[0].distanceKm).toBeNull();
  });
});

describe('formatDealEndDate', () => {
  it('formats the last day and tolerates bad input', () => {
    expect(formatDealEndDate('2025-06-12T22:59:59Z', 'en')).toMatch(/12|13/);
    expect(formatDealEndDate('not a date', 'fr')).toBe('');
  });
});
