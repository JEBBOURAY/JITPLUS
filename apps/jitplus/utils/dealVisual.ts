// Texts shared by the deal list, the detail screen and the merchant page (no React Native).
import {
  dealBadgeLabel, dealTimeLeftLabel, dealPrices,
  type ClientDealStore, type DealTranslate,
} from '@jitplus/shared/src/deals';
import { intlLocaleTag } from '@jitplus/shared/src/currency';
import { getDistanceKm } from '@/utils/distance';

export type Translate = DealTranslate;
// Badge, countdown and price texts are implemented once for both apps.
export { dealBadgeLabel, dealTimeLeftLabel, dealPrices };

/**
 * Deal links are typed by merchants: only plain https URLs are opened, and a
 * user-info part ("https://bank.ma@evil.com") is refused because it hides the
 * real host.
 */
export function isSafeDealLink(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/[^\s/?#@\\]+(?:[/?#]\S*)?$/i.test(url);
}

/**
 * Stores of a deal, nearest first. The server distance is used when it was
 * computed, else the one from the position known on the device.
 */
export function dealStoresByDistance(
  stores: readonly ClientDealStore[] | undefined,
  user: { latitude: number; longitude: number } | null,
): ClientDealStore[] {
  const list = (stores ?? []).map((s) => {
    if (s.distanceKm != null || !user || s.latitude == null || s.longitude == null) return s;
    return { ...s, distanceKm: getDistanceKm(user.latitude, user.longitude, s.latitude, s.longitude) };
  });
  return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

/** Last day of the deal ("12 juin"), in Morocco time where the deal ends at 23:59. */
export function formatDealEndDate(endsAt: string, locale: string): string {
  const tag = intlLocaleTag(locale);
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(tag, { day: 'numeric', month: 'long', timeZone: 'Africa/Casablanca' });
  } catch {
    // Engines without time zone data reject the option.
    return date.toLocaleDateString(tag, { day: 'numeric', month: 'long' });
  }
}

/** Host shown under the "Voir l'offre" button, so the user knows where the link goes. */
export function dealLinkHost(url: string): string | null {
  const match = /^https:\/\/([^\s/?#:@\\]+)/i.exec(url);
  return match ? match[1].toLowerCase().replace(/^www\./, '') : null;
}
