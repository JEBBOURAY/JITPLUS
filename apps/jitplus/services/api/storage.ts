import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const IS_DEV = __DEV__;

// ── Storage keys ──────────────────────────────────────────
const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
export const QR_TOKEN_KEY = 'qr_permanent_token';
const PROFILE_CACHE_KEY = 'client_profile_cache';
const REMEMBER_ME_KEY = 'rememberMe';
const EMAIL_OTP_NEW_USER_KEY = 'email_otp_new_user';

// ── SecureStore wrapper (falls back to memory on web) ──
const memoryTokens: Record<string, string | null> = {
  [TOKEN_KEY]: null,
  [REFRESH_TOKEN_KEY]: null,
};

/** When false, tokens are kept in memory only (not persisted to SecureStore) */
let _shouldPersist = true;

async function getStored(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return memoryTokens[key] ?? null;
  if (memoryTokens[key]) return memoryTokens[key];
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value) memoryTokens[key] = value;
    return value ?? null;
  } catch (e) {
    if (IS_DEV) console.warn(`SecureStore read failed (${key}):`, e);
    return null;
  }
}

async function setStored(key: string, value: string): Promise<void> {
  memoryTokens[key] = value;
  if (Platform.OS !== 'web' && _shouldPersist) {
    try { await SecureStore.setItemAsync(key, value); } catch (e) {
      if (IS_DEV) console.warn(`SecureStore write failed (${key}):`, e);
    }
  }
}

async function removeStored(key: string): Promise<void> {
  memoryTokens[key] = null;
  if (Platform.OS !== 'web') {
    try { await SecureStore.deleteItemAsync(key); } catch (e) {
      if (IS_DEV) console.warn(`SecureStore delete failed (${key}):`, e);
    }
  }
}

export const getToken = () => getStored(TOKEN_KEY);
export const setToken = (token: string) => setStored(TOKEN_KEY, token);
export const removeToken = () => removeStored(TOKEN_KEY);

export const getRefreshToken = () => getStored(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token: string) => setStored(REFRESH_TOKEN_KEY, token);
export const removeRefreshToken = () => removeStored(REFRESH_TOKEN_KEY);

/** Store both tokens from an auth response */
export async function persistTokens(data: { access_token?: string; refresh_token?: string }) {
  if (data.access_token) await setToken(data.access_token);
  if (data.refresh_token) await setRefreshToken(data.refresh_token);
}

/**
 * Legacy v1 QR tokens are permanent: cached so the QR still shows offline.
 * Short-lived v2 tokens are never cached.
 */
export const getCachedQrToken = () => getStored(QR_TOKEN_KEY);
export const setCachedQrToken = (token: string) => setStored(QR_TOKEN_KEY, token);
export const clearCachedQrToken = () => removeStored(QR_TOKEN_KEY);

// ── Token management helpers ──────────────────────────────
export async function clearAuth(): Promise<void> {
  await removeToken();
  await removeRefreshToken();
  await clearEmailOtpNewUser();
  await clearRememberMe();
  await clearCachedQrToken();
  await clearCachedProfile();
}

export async function setRememberMe(value: boolean): Promise<void> {
  _shouldPersist = value;
  await setStored(REMEMBER_ME_KEY, String(value));
}

/**
 * Writes to SecureStore the tokens of a session opened with
 * setRememberMe(false), once it is confirmed (forgot-password flow).
 */
export async function persistSession(): Promise<void> {
  await setRememberMe(true);
  await persistTokens({
    access_token: memoryTokens[TOKEN_KEY] ?? undefined,
    refresh_token: memoryTokens[REFRESH_TOKEN_KEY] ?? undefined,
  });
}

async function clearRememberMe(): Promise<void> {
  _shouldPersist = true;
  await removeStored(REMEMBER_ME_KEY);
}

export async function setEmailOtpNewUser(): Promise<void> {
  await setStored(EMAIL_OTP_NEW_USER_KEY, '1');
}

export async function getEmailOtpNewUser(): Promise<boolean> {
  return (await getStored(EMAIL_OTP_NEW_USER_KEY)) === '1';
}

export async function clearEmailOtpNewUser(): Promise<void> {
  await removeStored(EMAIL_OTP_NEW_USER_KEY);
}

// ── Offline profile cache ──────────────────────────────
// Store the authenticated client profile so it can be restored on cold-start
// even when the device is offline. Uses AsyncStorage: profile JSON regularly
// exceeds SecureStore's 2048-byte limit (Android Keystore silently drops the
// value today and will throw in a future SDK — seen in Sentry production).
// AsyncStorage is unencrypted, so only the fields the app needs offline are
// kept: contact details and birth date are refetched from the server.
const CACHED_PROFILE_FIELDS = [
  'id', 'prenom', 'nom', 'termsAccepted', 'hasPassword', 'language', 'countryCode',
  'emailVerified', 'telephoneVerified', 'shareInfoMerchants',
  'notifPush', 'notifEmail', 'notifWhatsapp', 'createdAt',
] as const;

export function pickCachedProfile(profile: unknown): Record<string, unknown> | null {
  if (!profile || typeof profile !== 'object') return null;
  const source = profile as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of CACHED_PROFILE_FIELDS) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}

export async function setCachedProfile(profile: unknown): Promise<void> {
  try {
    const json = JSON.stringify(pickCachedProfile(profile));
    if (Platform.OS === 'web') { memoryTokens[PROFILE_CACHE_KEY] = json; return; }
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, json);
    // One-time cleanup of the legacy oversized SecureStore entry
    SecureStore.deleteItemAsync(PROFILE_CACHE_KEY).catch(() => {});
  } catch { /* non-fatal */ }
}

export async function getCachedProfile<T = unknown>(): Promise<T | null> {
  try {
    const raw = Platform.OS === 'web'
      ? (memoryTokens[PROFILE_CACHE_KEY] ?? null)
      : await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    // Older installs cached the full profile: never hand those fields back.
    return pickCachedProfile(JSON.parse(raw)) as T | null;
  } catch { return null; }
}

async function clearCachedProfile(): Promise<void> {
  memoryTokens[PROFILE_CACHE_KEY] = null;
  if (Platform.OS === 'web') return;
  try { await AsyncStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* non-fatal */ }
  // Also purge the legacy SecureStore entry (pre-migration installs)
  try { await SecureStore.deleteItemAsync(PROFILE_CACHE_KEY); } catch { /* non-fatal */ }
}

// ── iOS reinstall ──
// The iOS keychain (SecureStore) survives an uninstall while AsyncStorage does
// not, so a reinstalled app silently reopened the previous account.
const INSTALL_MARKER_KEY = 'install_marker_v1';

/**
 * On the first launch of an install, drops the session left in the keychain by
 * a previous one. An update from a build without the marker is told apart by
 * the profile cache still being in AsyncStorage: that session is kept. Never throws.
 */
async function purgeSessionAfterReinstall(keys: string[]): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    if (await AsyncStorage.getItem(INSTALL_MARKER_KEY)) return;
    // Only a signed-in session writes the profile cache, so it tells an update
    // apart from a reinstall even when other startup code (theme, language,
    // query persister) has already written to AsyncStorage on this launch.
    const previousSession = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!previousSession) {
      await Promise.allSettled(keys.map((key) => SecureStore.deleteItemAsync(key)));
    }
    await AsyncStorage.setItem(INSTALL_MARKER_KEY, '1');
  } catch {
    // AsyncStorage unreadable: keep the session rather than log out by mistake.
  }
}

/** Keychain entries of a client session. */
export const purgeClientSessionAfterReinstall = async (): Promise<void> => {
  await purgeSessionAfterReinstall([TOKEN_KEY, REFRESH_TOKEN_KEY, QR_TOKEN_KEY, REMEMBER_ME_KEY, EMAIL_OTP_NEW_USER_KEY]);
};
