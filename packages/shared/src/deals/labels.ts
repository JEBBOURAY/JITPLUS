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

export interface DealPriceTexts {
  /** What the client pays: "Dès 79 DH / kg" */
  price: string | null;
  /** Shown next to it: the struck former price, or "Valeur 40 DH" for a free item */
  original: string | null;
  /** `original` is a former price to strike through */
  struck: boolean;
  /** "40 DH", when both prices are known */
  savings: string | null;
}

const NO_PRICE: DealPriceTexts = { price: null, original: null, struck: false, savings: null };

/**
 * Price texts of a deal, ready to display, in the merchant's currency (see
 * moneyFormatter). Each app provides the `deals.price.*` and `deals.valueOf` keys.
 */
export function dealPrices(offer: DealOffer, money: MoneyFormatter, t: DealTranslate): DealPriceTexts {
  const paid = (amount: number) => {
    const withUnit = offer.priceUnit
      ? t('deals.price.per', { price: money(amount), unit: t(`deals.price.unit.${offer.priceUnit}`) })
      : money(amount);
    return offer.priceFrom ? t('deals.price.from', { price: withUnit }) : withUnit;
  };
  const { originalPrice: original, dealPrice: promo } = offer;
  switch (offer.type) {
    case 'PRICE_DROP':
    case 'PERCENT_OFF':
      if (original == null || promo == null) return NO_PRICE;
      return { price: paid(promo), original: money(original), struck: true, savings: money(original - promo) };
    case 'BUY_X_GET_Y':
      return original == null ? NO_PRICE : { ...NO_PRICE, price: paid(original) };
    case 'FREE_ITEM':
      return original == null ? NO_PRICE : { ...NO_PRICE, original: t('deals.valueOf', { value: money(original) }) };
    default:
      return NO_PRICE;
  }
}
