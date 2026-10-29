import { DevSettings, I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import i18n, { type AppLocale, detectedLocale } from '@/i18n';
import { createLanguageProvider } from '@jitplus/shared/src/createLanguageProvider';

const RTL_RELOAD_KEY = 'rtl_reload_target';

/**
 * forceRTL only takes effect on the next launch, so the app reloads right away
 * instead of mixing directions until a manual restart.
 */
async function reloadForDirection(rtl: boolean) {
  if (Platform.OS === 'web') return;
  const target = rtl ? 'rtl' : 'ltr';
  try {
    // Already reloaded for this direction and it still differs (e.g. RTL not
    // supported by the build): reloading again would loop forever.
    if ((await AsyncStorage.getItem(RTL_RELOAD_KEY)) === target) return;
    await AsyncStorage.setItem(RTL_RELOAD_KEY, target);
  } catch {
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    if (__DEV__) DevSettings.reload();
  }
}

export const { LanguageProvider, useLanguage } = createLanguageProvider<AppLocale>({
  storageKey: 'app_language',
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, val) => AsyncStorage.setItem(key, val),
  },
  i18n,
  rtl: I18nManager,
  validLocales: ['fr', 'en', 'ar'],
  defaultLocale: detectedLocale,
  rtlLocales: ['ar'],
  onDirectionChange: (rtl) => { void reloadForDirection(rtl); },
});
