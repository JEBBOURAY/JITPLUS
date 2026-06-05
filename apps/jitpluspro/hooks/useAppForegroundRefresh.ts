/**
 * Selectively invalidate critical query caches when the app returns to the
 * foreground after being in background for more than 5 minutes.
 *
 * `refetchOnWindowFocus` is disabled globally to avoid the "refetch storm"
 * (10–15 queries firing in parallel on every resume), which used to block
 * the JS thread for several seconds.
 *
 * This hook narrows the post-resume refetch to the two query keys whose
 * staleness matters most for the merchant UX: the unread admin-notification
 * badge and the transactions list.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './useQueryHooks';

const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000;

export function useAppForegroundRefresh() {
  const queryClient = useQueryClient();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundSince = useRef<number>(Date.now());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next.match(/inactive|background/)) {
        backgroundSince.current = Date.now();
      }
      if (appState.current.match(/inactive|background/) && next === 'active') {
        const elapsed = Date.now() - backgroundSince.current;
        if (elapsed > BACKGROUND_THRESHOLD_MS) {
          queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifUnreadCount });
          queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
        }
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [queryClient]);
}
