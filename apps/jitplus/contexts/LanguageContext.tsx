import { I18nManager, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { type AppLocale, detectedLocale } from '@/i18n';
import { createLanguageProvider } from '@jitplus/shared/src/createLanguageProvider';

const showRestartAlert = () => {
  Alert.alert(
    i18n.t('profile.restartTitle'),
    i18n.t('profile.restartRequired'),
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
