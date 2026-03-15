import { I18n } from 'i18n-js';
import fr from './locales/fr';
import en from './locales/en';
import ar from './locales/ar';

export type AppLocale = 'fr' | 'en' | 'ar';

const i18n = new I18n({ fr, en, ar });

i18n.defaultLocale = 'fr';
i18n.locale = 'fr';
i18n.enableFallback = true;

export default i18n;
