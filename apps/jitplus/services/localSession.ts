import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { clearPendingDeal } from '@/services/pendingDeal';
import { resetPushTokenDedup } from '@/services/api/auth';
import { QUERY_CACHE_KEY } from '@/utils/queryPersister';
import { DEAL_ALERT_CARD_DISMISSED_KEY } from '@/utils/dealAlerts';
import { GUEST_MODE_KEY } from '@/stores/authStore';

const ASYNC_STORAGE_KEYS = [
  QUERY_CACHE_KEY, 'showWelcome', 'showGuidBadge', 'profile_draft', GUEST_MODE_KEY, DEAL_ALERT_CARD_DISMISSED_KEY,
];
// profile_draft: legacy location, drafts lived in SecureStore before the 2048-byte limit fix.
const SECURE_STORE_KEYS = ['qr_permanent_token', 'profile_draft', 'pendingClaimToken'];

let inFlight: Promise<void> | null = null;

/**
 * Wipes every trace of the current account from the device. Shared by the
 * explicit logout and by forced logouts (401 / rejected refresh), so the next
 * account on a shared device never sees the previous one's cached data.
 * Concurrent callers (several queued 401s) share the same run.
 */
export function clearLocalSession(queryClient: QueryClient, resetStore: () => void): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      resetPushTokenDedup();
      clearPendingDeal();
      try { await api.clearAuth(); } catch { /* best effort: keep wiping the rest */ }
      queryClient.clear();
      await Promise.allSettled([
        ...ASYNC_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(key)),
        ...SECURE_STORE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
      ]);
      resetStore();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
