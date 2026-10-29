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
import { logPerf } from '@jitplus/shared/src/devLogger';
import { Sentry } from '@/utils/sentry';
import { queryKeys } from './useQueryHooks';

const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Hook that refetches specific queries when the app comes to the foreground.
 * This is a targeted alternative to the global `refetchOnWindowFocus` option
 * which can cause performance issues with too many queries.
 */
export function useAppForegroundRefresh() {
  const queryClient = useQueryClient();
  const appState = useRef(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const wasInBackground = appState.current.match(/inactive|background/);
      const isNowActive = nextAppState === 'active';

      if (!wasInBackground && nextAppState !== 'active') {
        backgroundedAt.current = Date.now();
      }

      if (wasInBackground && isNowActive) {
        const elapsed = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        backgroundedAt.current = null;

        if (elapsed < BACKGROUND_THRESHOLD_MS) {
          logPerf('App', `foreground:skip-refresh (bg ${elapsed}ms)`);
        } else {
          const t0 = Date.now();
          logPerf('App', `foreground:start (bg ${elapsed}ms)`);
          // Defer to AFTER the resume frame: native side has lots of work
          // (camera, navigation, layout) and any HTTP fetch fired in the same
          // tick blocks the JS thread and produces visible jank.
          requestIdleCallback(() => {
            const refresh = async () => {
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifUnreadCount }),
                queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
              ]);
              const dt = Date.now() - t0;
              logPerf('App', `foreground:done ${dt}ms`);
            };
            if (Sentry) {
              Sentry.startSpan({ name: 'App Foreground Refresh', op: 'ui.load' }, refresh);
            } else {
              void refresh();
            }
          });
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [queryClient]);
}
