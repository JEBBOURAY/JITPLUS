import { I18n } from 'i18n-js';
import fr from './locales/fr';
import en from './locales/en';
import ar from './locales/ar';

export type AppLocale = 'fr' | 'en' | 'ar';

const i18n = new I18n({ fr, en, ar });

i18n.defaultLocale = 'fr';
i18n.locale = 'fr';
i18n.enableFallback = true;

// Arabic uses 6-form pluralization: zero, one, two, few, many, other
i18n.pluralization.register('ar', (_i18n, count) => {
  const n = typeof count === 'number' ? count : 0;
  if (n === 0) return ['zero'];
  if (n === 1) return ['one'];
  if (n === 2) return ['two'];
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return ['few'];
  if (mod100 >= 11 && mod100 <= 99) return ['many'];
  return ['other'];
});

export default i18n;
