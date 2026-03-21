/**
 * Configuration de devise globale pour l'application
 * Par défaut: Dirham Marocain (MAD)
 */

type CurrencyCode = 'MAD' | 'EUR' | 'USD' | 'GBP';

interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  position: 'before' | 'after'; // Position du symbole par rapport au montant
  decimals: number;
}

const CURRENCIES: Record<CurrencyCode, Currency> = {
  MAD: {
    code: 'MAD',
    symbol: 'DH',
    name: 'Dirham Marocain',
    position: 'after',
    decimals: 2,
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    position: 'after',
    decimals: 2,
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'Dollar US',
    position: 'before',
    decimals: 2,
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    name: 'Livre Sterling',
    position: 'before',
    decimals: 2,
  },
};

// Devise par défaut: Dirham Marocain
export const DEFAULT_CURRENCY: Currency = CURRENCIES.MAD;

/**
 * Format un montant avec la devise
 * @param amount - Montant à formater
 * @param currency - Devise (par défaut MAD)
 * @param locale - Locale pour le formatage des nombres (par défaut 'fr-MA')
 * @returns Montant formaté (ex: "150,00 DH")
 */
export const formatCurrency = (
  amount: number,
  currency: Currency = DEFAULT_CURRENCY,
  locale: string = 'fr-MA',
): string => {
  if (!Number.isFinite(amount)) return `0${',' + '0'.repeat(currency.decimals)} ${currency.symbol}`;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(amount);
  if (currency.position === 'after') {
    return `${formatted} ${currency.symbol}`;
  } else {
    return `${currency.symbol}${formatted}`;
  }
};

