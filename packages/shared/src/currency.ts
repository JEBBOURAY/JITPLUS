/**
 * Currencies a merchant can pick (default: Moroccan dirham). Shared by the Pro
 * app (settings, amounts) and the client app (merchant fiche, coupons, deals).
 * Codes must stay aligned with SUPPORTED_CURRENCIES in the backend
 * (apps/backend/src/common/constants.ts).
 */

export type CurrencyCode =
  | 'MAD' | 'XAF' | 'XOF' | 'DZD' | 'TND' | 'EGP' | 'MRU' | 'NGN' | 'GHS'
  | 'KES' | 'ZAR' | 'GNF' | 'CDF' | 'RWF' | 'MGA' | 'EUR' | 'USD';

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  /** Main countries, shown under the name in the picker */
  countries: string;
  /** Symbol placement relative to the amount */
  position: 'before' | 'after';
  decimals: number;
}

const c = (
  code: CurrencyCode,
  symbol: string,
  name: string,
  countries: string,
  position: Currency['position'] = 'after',
  decimals = 2,
): Currency => ({ code, symbol, name, countries, position, decimals });

/** Picker order: Morocco, CFA zones, rest of Africa, then EUR/USD. */
export const CURRENCY_LIST: readonly Currency[] = [
  c('MAD', 'DH', 'Dirham marocain', 'Maroc'),
  c('XAF', 'FCFA', 'Franc CFA (CEMAC)', 'Gabon, Cameroun, Congo, Tchad, Centrafrique, Guinée équatoriale', 'after', 0),
  c('XOF', 'FCFA', 'Franc CFA (UEMOA)', "Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Bénin, Togo, Niger, Guinée-Bissau", 'after', 0),
  c('DZD', 'DA', 'Dinar algérien', 'Algérie'),
  // 2 decimals: the backend rejects amounts with more than 2 decimals.
  c('TND', 'DT', 'Dinar tunisien', 'Tunisie'),
  c('EGP', 'E£', 'Livre égyptienne', 'Égypte'),
  c('MRU', 'UM', 'Ouguiya', 'Mauritanie'),
  c('GNF', 'FG', 'Franc guinéen', 'Guinée', 'after', 0),
  c('CDF', 'FC', 'Franc congolais', 'RD Congo'),
  c('RWF', 'FRw', 'Franc rwandais', 'Rwanda', 'after', 0),
  c('MGA', 'Ar', 'Ariary', 'Madagascar', 'after', 0),
  c('NGN', '₦', 'Naira', 'Nigeria', 'before'),
  c('GHS', 'GH₵', 'Cedi', 'Ghana', 'before'),
  c('KES', 'KSh', 'Shilling kényan', 'Kenya', 'before'),
  c('ZAR', 'R', 'Rand', 'Afrique du Sud', 'before'),
  c('EUR', '€', 'Euro', 'Zone euro'),
  c('USD', '$', 'Dollar US', 'États-Unis', 'before'),
];

const BY_CODE = Object.fromEntries(CURRENCY_LIST.map((cur) => [cur.code, cur])) as Record<CurrencyCode, Currency>;

export const DEFAULT_CURRENCY: Currency = BY_CODE.MAD;

/** Currency for an ISO code (falls back to MAD when missing or unknown). */
export const getCurrency = (code?: string | null): Currency =>
  (code && BY_CODE[code as CurrencyCode]) || DEFAULT_CURRENCY;

/** The dirham keeps the wording each language already used: DH / MAD / درهم. */
const MAD_SYMBOL: Record<string, string> = { fr: 'DH', en: 'MAD', ar: 'درهم' };

/** Symbol shown in text for an app locale (fr | en | ar). */
export function currencySymbol(code: string | null | undefined, locale = 'fr'): string {
  const cur = getCurrency(code);
  return cur.code === 'MAD' ? MAD_SYMBOL[locale] ?? cur.symbol : cur.symbol;
}

// Day-first English ("13 Jun 2025"), like the French and Arabic the apps ship with.
const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };

/** BCP 47 tag for Intl / toLocaleDateString from an app locale ("fr" → "fr-FR"). */
export function intlLocaleTag(locale: string): string {
  return INTL_LOCALE[locale] ?? 'fr-FR';
}

// Building an Intl.NumberFormat is costly (notably on Hermes) and amounts are
// formatted inside lists: one instance per (locale, decimals), reused.
const numberFormats = new Map<string, Intl.NumberFormat>();

/** Cached number formatter with a fixed number of decimals. */
export function numberFormat(intlLocale: string, decimals: number): Intl.NumberFormat {
  const key = `${intlLocale}|${decimals}`;
  let nf = numberFormats.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormats.set(key, nf);
  }
  return nf;
}

/**
 * Amount with its currency for running text: whole amounts without decimals
 * ("100 DH", "5 000 FCFA"), others with the currency's decimals ("12,50 DH").
 */
export function formatMoney(amount: number, code: string | null | undefined, locale = 'fr'): string {
  const cur = getCurrency(code);
  const value = Number.isFinite(amount) ? amount : 0;
  const decimals = Number.isInteger(value) ? 0 : cur.decimals;
  const formatted = numberFormat(INTL_LOCALE[locale] ?? 'fr-FR', decimals).format(value);
  const symbol = currencySymbol(cur.code, locale);
  return cur.position === 'before' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

/** Bound formatter, handy to pass to the scratch/deal helpers. */
export type MoneyFormatter = (amount: number) => string;

export const moneyFormatter = (code: string | null | undefined, locale = 'fr'): MoneyFormatter =>
  (amount) => formatMoney(amount, code, locale);
