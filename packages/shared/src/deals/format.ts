import type { DealOffer } from './types';

export type DealBadge =
  | { kind: 'percent'; value: number }
  | { kind: 'bogo'; buy: number; free: number }
  | { kind: 'free' }
  | null;

/** Badge shown on the thumbnail: "-30 %", "1+1", "OFFERT". Texts are translated by the apps. */
export function dealBadge(offer: DealOffer): DealBadge {
  switch (offer.type) {
    case 'PERCENT_OFF':
      return offer.percentOff ? { kind: 'percent', value: offer.percentOff } : null;
    case 'PRICE_DROP': {
      const pct = offer.percentOff ?? computePercentOff(offer.originalPrice, offer.dealPrice);
      return pct ? { kind: 'percent', value: pct } : null;
    }
    case 'BUY_X_GET_Y':
      return offer.buyQty && offer.freeQty ? { kind: 'bogo', buy: offer.buyQty, free: offer.freeQty } : null;
    case 'FREE_ITEM':
      return { kind: 'free' };
    default:
      return null;
  }
}

/** Rounded discount of a price drop, null when it is not a real discount. */
export function computePercentOff(original?: number | null, price?: number | null): number | null {
  if (original == null || price == null || !(original > 0) || price < 0 || price >= original) return null;
  const pct = Math.round((1 - price / original) * 100);
  return pct >= 1 ? Math.min(pct, 99) : null;
}

export interface DealTimeLeft {
  ended: boolean;
  /** Less than 24 h left: shown in orange */
  urgent: boolean;
  days: number;
  hours: number;
  minutes: number;
}

export function dealTimeLeft(endsAt: string | Date, now: Date = new Date()): DealTimeLeft {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (!(ms > 0)) return { ended: true, urgent: true, days: 0, hours: 0, minutes: 0 };
  const totalMinutes = Math.floor(ms / 60_000);
  return {
    ended: false,
    urgent: ms < 86_400_000,
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

/** Prices are shown without decimals when they are whole: 799 DH, 12,50 DH. */
export function formatDealPrice(value: number, locale = 'fr'): string {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-US' : 'fr-FR', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
