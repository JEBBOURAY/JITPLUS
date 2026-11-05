import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { currencySymbol, getCurrency, moneyFormatter, type Currency, type MoneyFormatter } from '@/config/currency';

/** Devise configurée par le commerçant connecté (MAD par défaut). */
export function useCurrency(): Currency {
  const code = useAuthStore((s) => s.merchant?.currency);
  return getCurrency(code);
}

/**
 * Devise prête pour les textes: `symbol` pour les libellés ("Prix (DH)") et
 * `money` pour les montants dans une phrase ("Dès 100 DH d'achat").
 */
export function useMoney(): { currency: Currency; symbol: string; money: MoneyFormatter } {
  const currency = useCurrency();
  const { locale } = useLanguage();
  return useMemo(
    () => ({ currency, symbol: currencySymbol(currency.code, locale), money: moneyFormatter(currency.code, locale) }),
    [currency, locale],
  );
}

/** Variante hors composant (helpers de formatage, messages push). */
export function getMerchantCurrency(): Currency {
  return getCurrency(useAuthStore.getState().merchant?.currency);
}
