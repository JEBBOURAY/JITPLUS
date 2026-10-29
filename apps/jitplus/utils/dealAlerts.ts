import { pluralKey } from '@jitplus/shared';
import {
  findMoroccoCity, MOROCCO_CITIES, moroccoCityLabel, nearestMoroccoCity,
  type DealAlertPreferences, type MoroccoCity,
} from '@jitplus/shared/src/deals';

type Translate = (key: string, params?: Record<string, unknown>) => string;
type LatLng = { latitude: number; longitude: number };

const DEAL_ALERT_NEEDS_CITY = 'DEAL_ALERT_NEEDS_CITY';
export const DEAL_ALERT_CARD_DISMISSED_KEY = '@jitplus_deal_alert_card_dismissed_at';
export const DEAL_ALERT_CARD_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * City offered by the activation card: the one picked in the feed, else the
 * closest to the known position, else the one the server derived for the feed.
 * The position itself never leaves the device for this.
 */
export function suggestAlertCity(
  chosenCityKey: string | null | undefined,
  coords: LatLng | null | undefined,
  serverCityKey?: string | null,
): string | null {
  if (chosenCityKey && findMoroccoCity(chosenCityKey)) return chosenCityKey;
  if (coords) {
    const nearest = nearestMoroccoCity(coords.latitude, coords.longitude);
    if (nearest) return nearest.key;
  }
  return serverCityKey && findMoroccoCity(serverCityKey) ? serverCityKey : null;
}

/** True while the card was closed less than 30 days ago. A date in the future is ignored. */
export function isAlertCardSnoozed(raw: string | null | undefined, now = Date.now()): boolean {
  if (!raw) return false;
  const at = Number(raw);
  return Number.isFinite(at) && at <= now && now - at < DEAL_ALERT_CARD_SNOOZE_MS;
}

/** `snoozed` is null until the stored dismissal has been read, so the card never flashes. */
export function shouldShowAlertCard(prefs: DealAlertPreferences | undefined, snoozed: boolean | null): boolean {
  return !!prefs && !prefs.enabled && snoozed === false;
}

export function alertCategoriesLabel(categories: readonly string[], t: Translate): string {
  if (categories.length === 0) return t('deals.alerts.allShops');
  if (categories.length === 1) return t(`categories.${categories[0]}`);
  return t(pluralKey('deals.alerts.categoryCount', categories.length), { count: categories.length });
}

/** Subtitle of the profile row, e.g. "Casablanca · tous les commerces". */
export function dealAlertStatusLabel(prefs: DealAlertPreferences, locale: string, t: Translate): string {
  if (prefs.enabled && findMoroccoCity(prefs.cityKey)) {
    return `${moroccoCityLabel(prefs.cityKey, locale)} · ${alertCategoriesLabel(prefs.categories, t)}`;
  }
  return prefs.online ? t('deals.alerts.status.onlineOnly') : t('deals.alerts.status.off');
}

export function toggleAlertCategory(categories: readonly string[], id: string): string[] {
  return categories.includes(id) ? categories.filter((c) => c !== id) : [...categories, id];
}

export function isDealAlertNeedsCityError(error: unknown): boolean {
  const data = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data;
  return data?.code === DEAL_ALERT_NEEDS_CITY;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Accent-insensitive search on the French, English and Arabic names. */
export function searchMoroccoCities(query: string): readonly MoroccoCity[] {
  const q = fold(query);
  if (!q) return MOROCCO_CITIES;
  return MOROCCO_CITIES.filter((c) => [c.fr, c.en, c.ar, c.key.replace(/_/g, ' ')].some((name) => fold(name).includes(q)));
}
