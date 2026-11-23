import { I18n } from 'i18n-js';
import { Platform, NativeModules } from 'react-native';
import fr from './locales/fr';
import en from './locales/en';
import ar from './locales/ar';
import { IOS_STORE_COPY } from './iosStoreCopy';

export type AppLocale = 'fr' | 'en' | 'ar';

const SUPPORTED_LOCALES: AppLocale[] = ['fr', 'en', 'ar'];

function getDeviceLocale(): AppLocale {
  let raw: string | undefined;
  if (Platform.OS === 'ios') {
    const settings = NativeModules.SettingsManager?.settings;
    raw = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
  } else {
    raw = NativeModules.I18nManager?.localeIdentifier;
  }

  // Intl fallback when NativeModules returns nothing (e.g. older Android, Expo Go)
  if (!raw) {
    try {
      raw = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      // Hermes/JSC Intl unavailable — fall through to default
    }
  }

  const lang = (raw ?? '').split(/[-_]/)[0]?.toLowerCase();
  if (SUPPORTED_LOCALES.includes(lang as AppLocale)) return lang as AppLocale;
  return 'fr';
}

export const detectedLocale = getDeviceLocale();

const i18n = new I18n({ fr, en, ar });
// App Store 3.1.1 / 3.1.3: no "upgrade" / "contact us" calls to action for the
// Pro plan on iOS (deep-merged over the regular strings).
if (Platform.OS === 'ios') i18n.store(IOS_STORE_COPY);

i18n.defaultLocale = 'fr';
i18n.locale = detectedLocale;
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
