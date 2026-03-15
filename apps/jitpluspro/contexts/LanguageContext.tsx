import { I18nManager, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import i18n from '@/i18n';
import { createLanguageProvider } from '@jitplus/shared/src/createLanguageProvider';

export type AppLocale = 'fr' | 'en' | 'ar';

// ── Language metadata ──────────────────────────────────────
export const LANGUAGES: { code: AppLocale; label: string; flag: string; nativeLabel: string }[] = [
  { code: 'fr', label: 'Français',   flag: '🇫🇷', nativeLabel: 'Français'  },
  { code: 'en', label: 'English',    flag: '🇬🇧', nativeLabel: 'English'   },
  { code: 'ar', label: 'العربية',   flag: '🇸🇦', nativeLabel: 'العربية'  },
];

const showRestartAlert = (isRTL: boolean) => {
  Alert.alert(
    isRTL ? '\u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0645\u0637\u0644\u0648\u0628\u0629' : 'Red\u00e9marrage requis',
    isRTL
      ? '\u064a\u0631\u062c\u0649 \u0625\u063a\u0644\u0627\u0642 \u0627\u0644\u062a\u0637\u0628\u064a\u0642 \u0648\u0625\u0639\u0627\u062f\u0629 \u0641\u062a\u062d\u0647 \u0644\u062a\u0637\u0628\u064a\u0642 \u0627\u062a\u062c\u0627\u0647 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 (\u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646 \u0625\u0644\u0649 \u0627\u0644\u064a\u0633\u0627\u0631).'
      : 'Veuillez fermer et relancer l\u2019application pour appliquer la direction de la langue s\u00e9lectionn\u00e9e.',
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
  defaultLocale: 'fr',
  rtlLocales: ['ar'],
});
