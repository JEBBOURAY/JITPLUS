import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { createApiClient, resolveApiUrl, resolveServerBaseUrl } from '@jitplus/shared/src/apiFactory';
import { API_TIMEOUT_MS } from '@/constants/app';

const ENV_URL = process.env.EXPO_PUBLIC_API_URL;
const IS_DEV = __DEV__;

// ── Event emitter for signaling 401 to consumers (AuthContext) ──
type AuthEventListener = () => void;
const authListeners: AuthEventListener[] = [];
export const onUnauthorized = (listener: AuthEventListener) => {
  authListeners.push(listener);
  return () => {
    const idx = authListeners.indexOf(listener);
    if (idx >= 0) authListeners.splice(idx, 1);
  };
};

export const getServerBaseUrl = (): string => resolveServerBaseUrl(ENV_URL, IS_DEV);

const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/google-login',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/client-auth/send-otp',
  '/client-auth/verify-otp',
];

const api = createApiClient({
  envUrl: ENV_URL,
  isDev: IS_DEV,
  timeout: API_TIMEOUT_MS,
  getToken: () => SecureStore.getItemAsync('accessToken'),
  setToken: (token) => SecureStore.setItemAsync('accessToken', token),
  refreshToken: async () => {
    const refreshToken = await SecureStore.getItemAsync('refreshToken');
    const sessionId = await SecureStore.getItemAsync('sessionId');
    if (!refreshToken || !sessionId) throw new Error('No refresh credentials');

    const baseURL = resolveApiUrl(ENV_URL, IS_DEV);
    const { data } = await axios.post(`${baseURL}/auth/refresh-token`, {
      refresh_token: refreshToken,
      session_id: sessionId,
    });

    if (data.refresh_token) await SecureStore.setItemAsync('refreshToken', data.refresh_token);
    if (data.session_id) await SecureStore.setItemAsync('sessionId', data.session_id);
    return data.access_token;
  },
  onAuthFailure: () => {
    SecureStore.deleteItemAsync('accessToken').catch(() => {});
    SecureStore.deleteItemAsync('refreshToken').catch(() => {});
    SecureStore.deleteItemAsync('sessionId').catch(() => {});
    authListeners.forEach((fn) => fn());
  },
  authRoutes: AUTH_ROUTES,
});

if (IS_DEV) {
  console.log('[API] URL configurée:', resolveApiUrl(ENV_URL, IS_DEV));
  if (!ENV_URL) {
    console.warn('[API] EXPO_PUBLIC_API_URL non définie, utilisation du fallback local');
  }
}

export default api;
