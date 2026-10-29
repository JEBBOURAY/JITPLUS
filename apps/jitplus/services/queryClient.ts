import { QueryClient, QueryCache, MutationCache, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';

// Sync React Query's online state with NetInfo — pauses mutations offline
// and auto-replays them on reconnect.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

// SECURITY: Reduced from 24h to 4h to limit data exposure window if device is
// seized/rooted. AsyncStorage is unencrypted — shorter TTL = less recoverable data.
export const CACHE_MAX_AGE = 4 * 60 * 60 * 1000;

function getStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status
    ?? (error as { status?: number })?.status;
}

// Gateway statuses come from a proxy/load balancer (Cloud Run, carrier, Play pre-launch
// test devices) rather than our API code, so they are noise in Sentry.
const GATEWAY_STATUSES = new Set([502, 503, 504]);

// Expected HTTP 4xx (business/validation failures) are not reported to Sentry.
function isServerOrNetworkError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return !status || (status >= 500 && !GATEWAY_STATUSES.has(status));
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (!__DEV__ && isServerOrNetworkError(error)) {
        Sentry.captureException(error, { tags: { source: 'react-query' } });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (!__DEV__ && isServerOrNetworkError(error)) {
        Sentry.captureException(error, { tags: { source: 'react-query-mutation' } });
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = getStatus(error);
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: false,
      // Must be >= persister maxAge so the in-memory cache isn't garbage-
      // collected before the persister considers it valid.
      gcTime: CACHE_MAX_AGE,
      // Only stale queries are refreshed after a reconnection (e.g. offline → 4G).
      refetchOnReconnect: true,
    },
  },
});
