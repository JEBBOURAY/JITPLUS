import { I18nManager, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import i18n, { detectedLocale } from '@/i18n';
import { createLanguageProvider } from '@jitplus/shared/src/createLanguageProvider';

export type AppLocale = 'fr' | 'en' | 'ar';

// ── Language metadata ──────────────────────────────────────
export const LANGUAGES: { code: AppLocale; label: string; flag: string; nativeLabel: string }[] = [
  { code: 'fr', label: 'Français',   flag: '\u{1F1EB}\u{1F1F7}', nativeLabel: 'Français'  },
  { code: 'en', label: 'English',    flag: '\u{1F1EC}\u{1F1E7}', nativeLabel: 'English'   },
  { code: 'ar', label: '\u0627\u0644\u062F\u0627\u0631\u0650\u062C\u0629',   flag: '\u{1F1F2}\u{1F1E6}', nativeLabel: '\u0627\u0644\u062F\u0627\u0631\u0650\u062C\u0629'  },
];

const showRestartAlert = () => {
  Alert.alert(
    i18n.t('account.restartTitle'),
    i18n.t('account.restartRequired'),
    [{ text: 'OK' }],
  );
};

export const { LanguageProvider, useLanguage } = createLanguageProvider<AppLocale>({
  storageKey: 'jitpluspro_language',
  storage: {
    getItem: (key) => SecureStore.getItemAsync(key).then((v) => v ?? null),
    setItem: (key, val) => SecureStore.setItemAsync(key, val),
  },
  i18n,
  rtl: I18nManager,
  showRestartAlert,
  validLocales: ['fr', 'en', 'ar'],
  defaultLocale: detectedLocale,
  rtlLocales: ['ar'],
});
