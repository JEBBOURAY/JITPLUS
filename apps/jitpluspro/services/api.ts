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

/** API base URL (with path prefix) — for native uploads that bypass axios. */
export const getApiBaseUrl = (): string => resolveApiUrl(ENV_URL, IS_DEV);

// Memory cache for accessToken: SecureStore reads hit Android Keystore which
// can take 10–30 ms each. The interceptor calls getToken() on EVERY request,
// so without a cache we eat that latency on every API call.
let cachedToken: string | null = null;
let cachedTokenLoaded = false;

const getCachedToken = async (): Promise<string | null> => {
  if (!cachedTokenLoaded) {
    cachedToken = await SecureStore.getItemAsync('accessToken');
    cachedTokenLoaded = true;
  }
  return cachedToken;
};

/** Current access token — for native uploads (expo-file-system) that bypass axios interceptors. */
export const getAccessToken = getCachedToken;

const setCachedToken = async (token: string): Promise<void> => {
  cachedToken = token;
  cachedTokenLoaded = true;
  await SecureStore.setItemAsync('accessToken', token);
};

const clearCachedToken = (): void => {
  cachedToken = null;
  cachedTokenLoaded = true;
};

const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/google-login',
  '/auth/google-register',
  '/auth/apple-login',
  '/auth/apple-register',
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
  getToken: getCachedToken,
  setToken: setCachedToken,
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
    clearCachedToken();
    SecureStore.deleteItemAsync('accessToken').catch(() => {});
    SecureStore.deleteItemAsync('refreshToken').catch(() => {});
    SecureStore.deleteItemAsync('sessionId').catch(() => {});
    authListeners.forEach((fn) => fn());
  },
  authRoutes: AUTH_ROUTES,
});

// Exposed so AuthContext / login flows that write directly to SecureStore
// can also invalidate the in-memory cache.
export const resetApiTokenCache = (): void => {
  clearCachedToken();
};

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
