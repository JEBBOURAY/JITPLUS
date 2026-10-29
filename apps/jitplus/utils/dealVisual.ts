// Texts shared by the deal list, the detail screen and the merchant page (no React Native).
import {
  dealBadge, dealTimeLeft, formatDealPrice, type ClientDealStore, type DealOffer,
} from '@jitplus/shared/src/deals';
import { getDistanceKm } from '@/utils/distance';

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export function dealBadgeLabel(offer: DealOffer, t: Translate): string | null {
  const badge = dealBadge(offer);
  if (!badge) return null;
  switch (badge.kind) {
    case 'percent':
      return t('deals.badge.percent', { value: badge.value });
    case 'bogo':
      return t('deals.badge.bogo', { buy: badge.buy, free: badge.free });
    default:
      return t('deals.badge.free');
  }
}

/** "Expire dans 3 j", with `urgent` under 24 h (shown in orange). */
export function dealTimeLeftLabel(
  endsAt: string | Date,
  t: Translate,
  now: Date = new Date(),
): { text: string; urgent: boolean; ended: boolean } {
  const left = dealTimeLeft(endsAt, now);
  if (left.ended) return { text: t('deals.time.ended'), urgent: false, ended: true };
  const text = left.days >= 1
    ? t('deals.time.days', { count: left.days })
    : left.hours >= 1
      ? t('deals.time.hours', { count: left.hours })
      : t('deals.time.minutes', { count: Math.max(1, left.minutes) });
  return { text, urgent: left.urgent, ended: false };
}

/** Promo price and struck original price. */
export function dealPrices(offer: DealOffer, t: Translate, locale: string): { price: string | null; original: string | null } {
  const money = (n: number) => t('deals.price', { value: formatDealPrice(n, locale) });
  if (offer.type === 'PRICE_DROP' && offer.dealPrice != null && offer.originalPrice != null) {
    return { price: money(offer.dealPrice), original: money(offer.originalPrice) };
  }
  if (offer.type === 'FREE_ITEM' && offer.originalPrice != null) {
    return { price: null, original: money(offer.originalPrice) };
  }
  return { price: null, original: null };
}

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
  const tag = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-FR';
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
