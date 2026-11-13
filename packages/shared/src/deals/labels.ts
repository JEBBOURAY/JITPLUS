// Deal texts shared by the client and merchant apps (no React Native).
// Each app provides the `deals.badge.*` and `deals.time.*` keys in its locales.
import type { MoneyFormatter } from '../currency';
import { dealBadge, dealTimeLeft } from './format';
import type { DealOffer } from './types';

export type DealTranslate = (key: string, params?: Record<string, unknown>) => string;

export function dealBadgeLabel(offer: DealOffer, t: DealTranslate): string | null {
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
  t: DealTranslate,
  now: Date = new Date(),
): { text: string; urgent: boolean; ended: boolean } {
  const left = dealTimeLeft(endsAt, now);
  if (left.ended) return { text: t('deals.time.ended'), urgent: false, ended: true };
  // Darija counts 2 to 10 with the plural noun ("3 أيام") and the singular otherwise ("15 يوم").
  const timeText = (unit: 'days' | 'hours' | 'minutes', count: number) =>
    t(`deals.time.${unit}${count >= 2 && count <= 10 ? 'Few' : ''}`, { count });
  const text = left.days >= 1
    ? timeText('days', left.days)
    : left.hours >= 1
      ? timeText('hours', left.hours)
      : timeText('minutes', Math.max(1, left.minutes));
  return { text, urgent: left.urgent, ended: false };
}

/** Promo price and struck original price, in the merchant's currency (see moneyFormatter). */
export function dealPrices(offer: DealOffer, money: MoneyFormatter): { price: string | null; original: string | null } {
  if (offer.type === 'PRICE_DROP' && offer.dealPrice != null && offer.originalPrice != null) {
    return { price: money(offer.dealPrice), original: money(offer.originalPrice) };
  }
  if (offer.type === 'FREE_ITEM' && offer.originalPrice != null) {
    return { price: null, original: money(offer.originalPrice) };
  }
  return { price: null, original: null };
}
