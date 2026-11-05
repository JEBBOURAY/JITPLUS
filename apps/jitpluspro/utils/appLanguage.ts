import * as SecureStore from 'expo-secure-store';
import i18n from '@/i18n';

/** Same key and storage as LanguageContext (SecureStore, not AsyncStorage). */
const LANGUAGE_KEY = 'jitpluspro_language';
const SUPPORTED = ['fr', 'en', 'ar'] as const;
type AppLanguage = (typeof SUPPORTED)[number];

function normalize(v: string | null | undefined): AppLanguage | null {
  const code = v?.slice(0, 2).toLowerCase();
  return code && (SUPPORTED as readonly string[]).includes(code) ? (code as AppLanguage) : null;
}

/**
 * Language the merchant chose in the app, sent to the backend so automatic
 * pushes are written in it. Falls back to the active i18n locale, then 'fr'.
 */
export async function getAppLanguage(): Promise<AppLanguage> {
  const stored = await SecureStore.getItemAsync(LANGUAGE_KEY).catch(() => null);
  return normalize(stored) ?? normalize(i18n.locale) ?? 'fr';
}
