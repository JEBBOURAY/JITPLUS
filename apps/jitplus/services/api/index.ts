import axios from 'axios';
import { createApiClient, resolveApiUrl, resolveServerBaseUrl } from '@jitplus/shared/src/apiFactory';
import { logInfo, logApiError } from '@/utils/devLogger';
import {
  getToken, setToken, removeToken,
  getRefreshToken, setRefreshToken, removeRefreshToken,
  getStoredToken, clearAuth, setRememberMe, getRememberMe, clearRememberMe,
  setEmailOtpNewUser, getEmailOtpNewUser, clearEmailOtpNewUser,
} from './storage';
import { createAuthMethods } from './auth';
import { createProfileMethods } from './profile';
import { createMerchantMethods } from './merchants';
import { createNotificationMethods } from './notifications';
import { createReferralMethods } from './referral';
import { createLuckyWheelMethods } from './lucky-wheel';

const ENV_URL = process.env.EXPO_PUBLIC_API_URL;
const IS_DEV = __DEV__;

// SECURITY: Hard-block cleartext HTTP in production to prevent MitM attacks
if (!IS_DEV && ENV_URL && !ENV_URL.startsWith('https://')) {
  throw new Error(`[SECURITY] EXPO_PUBLIC_API_URL must use HTTPS in production. Current value uses cleartext HTTP — aborting.`);
}

/** Base server URL (without /api/v1) — used for static assets like uploaded images */
export function getServerBaseUrl(): string {
  return resolveServerBaseUrl(ENV_URL, IS_DEV);
}

const AUTH_ROUTES = [
  '/client-auth/refresh',
  '/client-auth/login-email',
  '/client-auth/google-login',
  '/client-auth/apple-login',
];

let onUnauthorized: (() => void) | undefined;

const http = createApiClient({
  envUrl: ENV_URL,
  isDev: IS_DEV,
  timeout: 15000,
  getToken,
  setToken,
  refreshToken: async () => {
    const rt = await getRefreshToken();
    if (!rt) throw new Error('No refresh token');
    const baseURL = resolveApiUrl(ENV_URL, IS_DEV);
    const { data } = await axios.post(`${baseURL}/client-auth/refresh`, { refresh_token: rt });
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
    if (!data.access_token) throw new Error('No access token in refresh response');
    return data.access_token;
  },
  onAuthFailure: () => {
    removeToken().catch((e) => { if (__DEV__) console.warn('Failed to remove token', e); });
    removeRefreshToken().catch((e) => { if (__DEV__) console.warn('Failed to remove refresh token', e); });
    onUnauthorized?.();
  },
  authRoutes: AUTH_ROUTES,
});

// ── Dev-mode request/response logging ──
if (IS_DEV) {
  logInfo('API', 'Base URL: ' + resolveApiUrl(ENV_URL, IS_DEV));
  http.interceptors.response.use(
    (res) => { logInfo('API', `${res.config.method?.toUpperCase()} ${res.config.url} → ${res.status}`); return res; },
    (error) => { logApiError('API', error); return Promise.reject(error); },
  );
}

export const api = {
  /** Register a callback invoked when a 401 is received */
  setOnUnauthorized(callback: () => void) { onUnauthorized = callback; },

  // Token / session management
  getStoredToken, clearAuth,
  setRememberMe, getRememberMe, clearRememberMe,
  setEmailOtpNewUser, getEmailOtpNewUser, clearEmailOtpNewUser,

  // Domain methods
  ...createAuthMethods(http),
  ...createProfileMethods(http),
  ...createMerchantMethods(http),
  ...createNotificationMethods(http),
  ...createReferralMethods(http),
  ...createLuckyWheelMethods(http),
};
