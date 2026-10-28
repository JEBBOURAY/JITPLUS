import {
  buildDealAlertUpdate, buildDealFeedParams, buildDealPositionParams, dealArea, roundCoord,
} from '@/services/api/deals';

describe('dealArea', () => {
  it('sends a chosen city without the position', () => {
    expect(dealArea('rabat', { latitude: 33.57, longitude: -7.58 })).toEqual({ cityKey: 'rabat', lat: null, lng: null });
  });

  it('rounds the position when no city is chosen', () => {
    expect(dealArea(null, { latitude: 33.573112, longitude: -7.589843 })).toEqual({ cityKey: null, lat: 33.573, lng: -7.59 });
    expect(dealArea(null, null)).toEqual({ cityKey: null, lat: null, lng: null });
  });
});

describe('buildDealPositionParams', () => {
  it('keeps valid coordinates and city keys only', () => {
    expect(buildDealPositionParams({ lat: 33.5731, lng: -7.5898, cityKey: 'casablanca' }))
      .toEqual({ lat: 33.573, lng: -7.59, cityKey: 'casablanca' });
    expect(buildDealPositionParams({ lat: 95, lng: 10 })).toEqual({});
    expect(buildDealPositionParams({ lat: 33, lng: null })).toEqual({});
    expect(buildDealPositionParams({ lat: Number.NaN, lng: 1 })).toEqual({});
    expect(buildDealPositionParams({ cityKey: 'Casa Blanca' })).toEqual({});
    expect(buildDealPositionParams({ cityKey: '../x' })).toEqual({});
  });
});

describe('buildDealFeedParams', () => {
  it('passes the tab, category and opaque cursor through', () => {
    expect(buildDealFeedParams({ tab: 'nearby', category: 'RESTAURANT', cursor: '12.4' }))
      .toEqual({ tab: 'nearby', category: 'RESTAURANT', cursor: '12.4' });
    expect(buildDealFeedParams({ tab: 'online', cursor: '40' })).toEqual({ tab: 'online', cursor: '40' });
  });

  it('drops values the server would reject', () => {
    expect(buildDealFeedParams({ tab: 'new', category: 'restaurant', cursor: 'abc' })).toEqual({ tab: 'new' });
    expect(buildDealFeedParams({ tab: 'ending', category: null, cursor: '12345' })).toEqual({ tab: 'ending' });
  });
});

describe('roundCoord', () => {
  it('keeps three decimals', () => {
    expect(roundCoord(33.57351)).toBe(33.574);
    expect(roundCoord(-7.0004)).toBe(-7);
  });
});

describe('buildDealAlertUpdate', () => {
  it('sends only the fields given, never a position', () => {
    expect(buildDealAlertUpdate({ enabled: true, cityKey: 'casablanca' })).toEqual({ enabled: true, cityKey: 'casablanca' });
    expect(buildDealAlertUpdate({ online: false })).toEqual({ online: false });
    expect(buildDealAlertUpdate({ cityKey: null })).toEqual({ cityKey: null });
    expect(buildDealAlertUpdate({ lat: 33.5, lng: -7.5 } as never)).toEqual({});
  });

  it('drops invalid city keys and categories, and removes duplicates', () => {
    expect(buildDealAlertUpdate({ cityKey: '../x' })).toEqual({});
    expect(buildDealAlertUpdate({ categories: ['CAFE', 'cafe', 'CAFE', 'SPORT'] })).toEqual({ categories: ['CAFE', 'SPORT'] });
    expect(buildDealAlertUpdate({ categories: [] })).toEqual({ categories: [] });
  });
});
