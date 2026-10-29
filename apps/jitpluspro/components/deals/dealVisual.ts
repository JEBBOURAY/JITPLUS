// Texts shared by the deal list, wizard and detail (no React Native).
import { dealBadge, dealTimeLeft, formatDealPrice, type DealOffer } from '@jitplus/shared/src/deals';

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
export function dealTimeLeftLabel(endsAt: string | Date, t: Translate, now: Date = new Date()): { text: string; urgent: boolean; ended: boolean } {
  const left = dealTimeLeft(endsAt, now);
  if (left.ended) return { text: t('deals.time.ended'), urgent: false, ended: true };
  const text = left.days >= 1
    ? t('deals.time.days', { count: left.days })
    : left.hours >= 1
      ? t('deals.time.hours', { count: left.hours })
      : t('deals.time.minutes', { count: Math.max(1, left.minutes) });
  return { text, urgent: left.urgent, ended: false };
}

/** Promo price and struck original price, as shown on the client row. */
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
