import { I18nManager, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { type AppLocale, detectedLocale } from '@/i18n';
import { createLanguageProvider } from '@jitplus/shared/src/createLanguageProvider';

const showRestartAlert = (isRTL: boolean) => {
  Alert.alert(
    isRTL ? 'خاصك تعاود تشغل' : 'Redémarrage requis',
    isRTL
      ? 'عفاك سد الأپليكاسيون وعاود حلها باش يتبدل اتجاه الدارجة (من اليمين لليسار).'
      : 'Veuillez fermer et relancer l\u2019application pour appliquer la direction de la langue sélectionnée.',
    [{ text: 'OK' }],
  );
};

export const { LanguageProvider, useLanguage } = createLanguageProvider<AppLocale>({
  storageKey: 'app_language',
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, val) => AsyncStorage.setItem(key, val),
  },
  i18n,
  rtl: I18nManager,
  showRestartAlert,
  validLocales: ['fr', 'en', 'ar'],
  defaultLocale: detectedLocale,
  rtlLocales: ['ar'],
});
