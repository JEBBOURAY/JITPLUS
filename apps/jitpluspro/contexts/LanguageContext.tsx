import { I18nManager, Alert, Platform, BackHandler } from 'react-native';
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

const showRestartAlert = (isRTL: boolean) => {
  const title = isRTL ? '\u062E\u0627\u0635\u0643 \u062A\u0639\u0627\u0648\u062F \u062A\u0634\u063A\u0644 \u0644\u0623\u0628\u0644\u064A\u0643\u0627\u0633\u064A\u0648\u0646' : 'Red\u00e9marrage requis';
  const message = isRTL
    ? '\u0633\u0643\u0631 \u0644\u0623\u0628\u0644\u064A\u0643\u0627\u0633\u064A\u0648\u0646 \u0648\u0639\u0627\u0648\u062F \u062D\u0644\u0647\u0627 \u0628\u0627\u0634 \u064A\u062A\u0628\u062F\u0644 \u0627\u0644\u0627\u062A\u062C\u0627\u0647.'
    : 'Fermez et relancez l\u2019application pour appliquer le changement.';

  const buttons: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }[] =
    Platform.OS === 'android'
      ? [
          { text: isRTL ? '\u0645\u0646 \u0628\u0639\u062F' : 'Plus tard', style: 'cancel' },
          { text: isRTL ? '\u0633\u0643\u0631' : 'Fermer', onPress: () => BackHandler.exitApp() },
        ]
      : [{ text: 'OK' }];

  Alert.alert(title, message, buttons);
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
