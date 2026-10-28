import {
  alertCategoriesLabel, dealAlertStatusLabel, DEAL_ALERT_CARD_SNOOZE_MS, isAlertCardSnoozed,
  isDealAlertNeedsCityError, searchMoroccoCities, shouldShowAlertCard, suggestAlertCity, toggleAlertCategory,
} from '@/utils/dealAlerts';
import type { DealAlertPreferences } from '@jitplus/shared/src/deals';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);
const prefs = (over: Partial<DealAlertPreferences> = {}): DealAlertPreferences => ({
  enabled: false, cityKey: null, categories: [], online: true, ...over,
});

describe('suggestAlertCity', () => {
  const casablanca = { latitude: 33.58, longitude: -7.6 };

  it('prefers the city chosen in the feed', () => {
    expect(suggestAlertCity('rabat', casablanca, 'fes')).toBe('rabat');
  });

  it('falls back to the city closest to the position', () => {
    expect(suggestAlertCity(null, casablanca, 'fes')).toBe('casablanca');
  });

  it('then uses the city the server derived, and ignores unknown keys', () => {
    expect(suggestAlertCity('atlantis', { latitude: 48.85, longitude: 2.35 }, 'fes')).toBe('fes');
    expect(suggestAlertCity(null, null, 'atlantis')).toBeNull();
    expect(suggestAlertCity(undefined, undefined)).toBeNull();
  });
});

describe('activation card', () => {
  const now = 1_700_000_000_000;

  it('stays hidden for 30 days after being closed', () => {
    expect(isAlertCardSnoozed(String(now - 1000), now)).toBe(true);
    expect(isAlertCardSnoozed(String(now - DEAL_ALERT_CARD_SNOOZE_MS + 1), now)).toBe(true);
    expect(isAlertCardSnoozed(String(now - DEAL_ALERT_CARD_SNOOZE_MS), now)).toBe(false);
  });

  it('ignores missing, invalid or future dismissal dates', () => {
    expect(isAlertCardSnoozed(null, now)).toBe(false);
    expect(isAlertCardSnoozed('', now)).toBe(false);
    expect(isAlertCardSnoozed('abc', now)).toBe(false);
    expect(isAlertCardSnoozed(String(now + 60_000), now)).toBe(false);
  });

  it('shows only once the preferences and the dismissal are known, and alerts are off', () => {
    expect(shouldShowAlertCard(prefs(), false)).toBe(true);
    expect(shouldShowAlertCard(prefs(), null)).toBe(false);
    expect(shouldShowAlertCard(prefs(), true)).toBe(false);
    expect(shouldShowAlertCard(undefined, false)).toBe(false);
    expect(shouldShowAlertCard(prefs({ enabled: true, cityKey: 'rabat' }), false)).toBe(false);
  });
});

describe('preferences status', () => {
  it('lists the city and the categories', () => {
    expect(dealAlertStatusLabel(prefs({ enabled: true, cityKey: 'casablanca' }), 'fr', t)).toBe('Casablanca · deals.alerts.allShops');
    expect(dealAlertStatusLabel(prefs({ enabled: true, cityKey: 'fes', categories: ['CAFE'] }), 'en', t)).toBe('Fez · categories.CAFE');
    expect(dealAlertStatusLabel(prefs({ enabled: true, cityKey: 'rabat', categories: ['CAFE', 'SPORT'] }), 'ar', t))
      .toBe('الرباط · deals.alerts.categoryCount_other:{"count":2}');
  });

  it('says when only online deals or nothing is sent', () => {
    expect(dealAlertStatusLabel(prefs(), 'fr', t)).toBe('deals.alerts.status.onlineOnly');
    expect(dealAlertStatusLabel(prefs({ online: false }), 'fr', t)).toBe('deals.alerts.status.off');
    expect(dealAlertStatusLabel(prefs({ enabled: true, cityKey: 'atlantis', online: false }), 'fr', t)).toBe('deals.alerts.status.off');
  });

  it('labels the categories', () => {
    expect(alertCategoriesLabel([], t)).toBe('deals.alerts.allShops');
    expect(alertCategoriesLabel(['A', 'B', 'C'], t)).toBe('deals.alerts.categoryCount_other:{"count":3}');
  });
});

describe('helpers', () => {
  it('toggles a category without mutating the list', () => {
    const list = ['CAFE'];
    expect(toggleAlertCategory(list, 'SPORT')).toEqual(['CAFE', 'SPORT']);
    expect(toggleAlertCategory(list, 'CAFE')).toEqual([]);
    expect(list).toEqual(['CAFE']);
  });

  it('recognises the "city required" error', () => {
    expect(isDealAlertNeedsCityError({ response: { data: { code: 'DEAL_ALERT_NEEDS_CITY' } } })).toBe(true);
    expect(isDealAlertNeedsCityError({ response: { data: { message: 'Ville inconnue' } } })).toBe(false);
    expect(isDealAlertNeedsCityError(new Error('x'))).toBe(false);
    expect(isDealAlertNeedsCityError(null)).toBe(false);
  });

  it('searches cities without accents, in every language', () => {
    expect(searchMoroccoCities('fes').map((c) => c.key)).toContain('fes');
    expect(searchMoroccoCities('KÉNI').map((c) => c.key)).toEqual(['kenitra']);
    expect(searchMoroccoCities('مراكش').map((c) => c.key)).toEqual(['marrakech']);
    expect(searchMoroccoCities('el jadida').map((c) => c.key)).toEqual(['el_jadida']);
    expect(searchMoroccoCities('   ').length).toBeGreaterThan(40);
    expect(searchMoroccoCities('zzz')).toEqual([]);
  });
});
