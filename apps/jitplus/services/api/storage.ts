import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const IS_DEV = __DEV__;

// ── Storage keys ──────────────────────────────────────────
export const TOKEN_KEY = 'auth_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const QR_TOKEN_KEY = 'qr_permanent_token';
const REMEMBER_ME_KEY = 'rememberMe';
const EMAIL_OTP_NEW_USER_KEY = 'email_otp_new_user';

// ── SecureStore wrapper (falls back to memory on web) ──
const memoryTokens: Record<string, string | null> = {
  [TOKEN_KEY]: null,
  [REFRESH_TOKEN_KEY]: null,
};

/** When false, tokens are kept in memory only (not persisted to SecureStore) */
let _shouldPersist = true;

export async function getStored(key: string): Promise<string | null> {
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

export async function setStored(key: string, value: string): Promise<void> {
  memoryTokens[key] = value;
  if (Platform.OS !== 'web' && _shouldPersist) {
    try { await SecureStore.setItemAsync(key, value); } catch (e) {
      if (IS_DEV) console.warn(`SecureStore write failed (${key}):`, e);
    }
  }
}

export async function removeStored(key: string): Promise<void> {
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

// ── Token management helpers ──────────────────────────────
export const getStoredToken = () => getToken();

export async function clearAuth(): Promise<void> {
  await removeToken();
  await removeRefreshToken();
  await clearEmailOtpNewUser();
  await clearRememberMe();
  await removeStored(QR_TOKEN_KEY);
}

export async function setRememberMe(value: boolean): Promise<void> {
  _shouldPersist = value;
  await setStored(REMEMBER_ME_KEY, String(value));
}

export async function getRememberMe(): Promise<boolean> {
  const val = await getStored(REMEMBER_ME_KEY);
  return val === 'true';
}

export async function clearRememberMe(): Promise<void> {
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
