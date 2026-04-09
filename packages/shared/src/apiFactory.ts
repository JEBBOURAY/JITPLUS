import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';

// ── Extend Axios config for retry metadata ──
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
    __retryCount?: number;
  }
}

export interface ApiFactoryConfig {
  /** EXPO_PUBLIC_API_URL value or undefined */
  envUrl?: string;
  /** Whether running in dev mode */
  isDev: boolean;
  /** Timeout in ms */
  timeout: number;
  /** Read the current access token */
  getToken: () => Promise<string | null>;
  /** Persist a new access token */
  setToken: (token: string) => Promise<void>;
  /** Attempt to refresh using stored refresh token; return new access token or throw */
  refreshToken: () => Promise<string>;
  /** Called when refresh fails (e.g., logout user) */
  onAuthFailure: () => void;
  /** Route prefixes that should NOT trigger token refresh on 401 */
  authRoutes?: string[];
}

/**
 * Resolve the API base URL with HTTPS enforcement in production.
 */
export function resolveApiUrl(envUrl: string | undefined, isDev: boolean): string {
  if (envUrl) {
    const url = envUrl + '/api/v1';
    if (!isDev && !url.startsWith('https://')) {
      throw new Error('[SECURITY] API URL must use HTTPS in production — refusing to send requests over HTTP');
    }
    return url;
  }
  if (!isDev) {
    throw new Error('[SECURITY] EXPO_PUBLIC_API_URL must be defined in production (HTTPS required)');
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api/v1';
  return 'http://localhost:3000/api/v1';
}

/**
 * Resolve the base server URL (without /api/v1) for static assets.
 */
export function resolveServerBaseUrl(envUrl: string | undefined, isDev: boolean): string {
  if (envUrl) {
    if (!isDev && !envUrl.startsWith('https://')) {
      throw new Error('[SECURITY] Server base URL must use HTTPS in production');
    }
    return envUrl;
  }
  if (!isDev) {
    throw new Error('[SECURITY] EXPO_PUBLIC_API_URL must be defined in production');
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1000;

/**
 * Create a pre-configured Axios instance with:
 * - Auth header injection
 * - Automatic retry on network/5xx errors (exponential backoff)
 * - 401 handling with token refresh + request queue
 */
export function createApiClient(config: ApiFactoryConfig): AxiosInstance {
  const baseURL = resolveApiUrl(config.envUrl, config.isDev);
  const authRoutes = config.authRoutes ?? [];

  const client = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
    },
    timeout: config.timeout,
  });

  // ── Request: attach auth token ──
  client.interceptors.request.use(async (req: import('axios').InternalAxiosRequestConfig) => {
    const token = await config.getToken();
    if (token) req.headers.Authorization = `Bearer ${token}`;
    return req;
  });

  // ── Response: auto-retry on transient errors ──
  client.interceptors.response.use(undefined, async (error: import('axios').AxiosError) => {
    const cfg = error.config;
    if (!cfg) return Promise.reject(error);

    const status = error.response?.status ?? 0;
    const isRetryable = !error.response || status >= 500 || status === 429;
    cfg.__retryCount = cfg.__retryCount ?? 0;

    if (isRetryable && cfg.__retryCount < MAX_RETRIES) {
      cfg.__retryCount += 1;
      // Use Retry-After header if available (429), otherwise exponential backoff
      let delay: number;
      if (status === 429 && error.response?.headers?.['retry-after']) {
        delay = Math.min(Number(error.response.headers['retry-after']) * 1000, 30_000);
        if (isNaN(delay) || delay <= 0) delay = RETRY_BASE_MS * Math.pow(2, cfg.__retryCount - 1);
      } else {
        delay = RETRY_BASE_MS * Math.pow(2, cfg.__retryCount - 1);
      }
      await new Promise((r) => setTimeout(r, delay));
      return client(cfg);
    }
    return Promise.reject(error);
  });

  // ── Response: 401 → refresh token ──
  let isRefreshing = false;
  let refreshQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

  const processQueue = (token: string | null, err: unknown = null) => {
    refreshQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(err)));
    refreshQueue = [];
  };

  client.interceptors.response.use(
    (res: import('axios').AxiosResponse) => res,
    async (error: import('axios').AxiosError) => {
      const original = error.config;
      // No config means the request was never sent — nothing to retry
      if (!original) return Promise.reject(error);

      const url = original.url ?? '';
      const isAuth = authRoutes.some((r) => url.includes(r));

      if (error.response?.status !== 401 || isAuth || original._retry) {
        if (error.response?.status === 429) {
          error.message = 'Trop de requêtes. Veuillez patienter quelques secondes.';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((newToken) => {
          original.headers.Authorization = `Bearer ${newToken}`;
          return client(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const newToken = await config.refreshToken();
        await config.setToken(newToken);
        processQueue(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return client(original);
      } catch (refreshError) {
        processQueue(null, refreshError);
        
        // Ensure we only log out on real HTTP errors, not transient network drops
        const ax = refreshError as any;
        const isNetworkError = ax?.isAxiosError && (ax?.code === 'ECONNABORTED' || ax?.code === 'ERR_NETWORK' || !ax?.response);
        if (!isNetworkError) {
          config.onAuthFailure();
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    },
  );

  return client;
}
