import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { createApiClient, resolveApiUrl, resolveServerBaseUrl } from '@jitplus/shared/src/apiFactory';
import { API_TIMEOUT_MS } from '@/constants/app';
import { logApiError, logInfo } from '@/utils/devLogger';

const ENV_URL = process.env.EXPO_PUBLIC_API_URL;
const IS_DEV = __DEV__;

// SECURITY: Ensure production API URL uses HTTPS to prevent cleartext traffic
if (!IS_DEV && ENV_URL && !ENV_URL.startsWith('https://')) {
  logApiError('api', new Error(`EXPO_PUBLIC_API_URL must use HTTPS in production. Current: ${ENV_URL}`));
}

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
  '/auth/apple-login',
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
    if (!refreshToken || !sessionId) {
      // Missing credentials → treat as auth failure (session expired), not a crash
      throw Object.assign(new Error('No refresh credentials'), { isAuthExpired: true, response: { status: 401 } });
    }

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

// ── Dev-mode request/response logging ──
if (IS_DEV) {
  logInfo('API', 'Base URL: ' + resolveApiUrl(ENV_URL, IS_DEV));
  if (!ENV_URL) {
    logInfo('API', 'EXPO_PUBLIC_API_URL not set, using local fallback');
  }

  api.interceptors.response.use(
    (res) => {
      logInfo('API', `${res.config.method?.toUpperCase()} ${res.config.url} → ${res.status}`);
      return res;
    },
    (error) => {
      // Suppress logging for /health/version 404 — handled gracefully by useForceUpdate
      const isVersionCheck = error?.config?.url?.includes('/health/version');
      const is404 = error?.response?.status === 404;
      if (!(isVersionCheck && is404)) {
        logApiError('API', error);
      }
      return Promise.reject(error);
    },
  );
}

export default api;
