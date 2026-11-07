/**
 * Devise du commerçant — par défaut: Dirham Marocain (MAD).
 * formatCurrency: montants à décimales fixes (tableaux, saisie, stats).
 */

import { DEFAULT_CURRENCY, numberFormat, type Currency } from '@jitplus/shared/src/currency';

// La liste des devises vit dans @jitplus/shared (partagée avec l'app client).
export {
  CURRENCY_LIST,
  getCurrency,
  currencySymbol,
  formatMoney,
  moneyFormatter,
  type Currency,
  type CurrencyCode,
  type MoneyFormatter,
} from '@jitplus/shared/src/currency';

// Map app locale to Intl locale for number formatting
const LOCALE_MAP: Record<string, string> = {
  fr: 'fr-MA',
  en: 'en-US',
  ar: 'ar-MA',
};

export const getIntlLocale = (appLocale?: string): string =>
  LOCALE_MAP[appLocale ?? 'fr'] ?? 'fr-MA';

/**
 * Format un montant avec la devise
 * @param amount - Montant à formater
 * @param currency - Devise (par défaut MAD)
 * @param locale - Locale pour le formatage des nombres (par défaut 'fr-MA')
 * @returns Montant formaté (ex: "150,00 DH", "5 000 FCFA")
 */
export const formatCurrency = (
  amount: number,
  currency: Currency = DEFAULT_CURRENCY,
  locale: string = 'fr-MA',
): string => {
  const value = Number.isFinite(amount) ? amount : 0;
  const formatted = numberFormat(locale, currency.decimals).format(value);
  return currency.position === 'after' ? `${formatted} ${currency.symbol}` : `${currency.symbol}${formatted}`;
};
