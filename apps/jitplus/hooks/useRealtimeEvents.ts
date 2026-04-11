/**
 * Real-time event listener for the client app.
 * Connects to the WebSocket server and auto-invalidates React Query cache
 * when the backend emits events (transaction, notification, etc.).
 *
 * Also handles FCM data payloads for background/offline scenarios.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import {
  WS_EVENTS,
  PointsUpdatedPayload,
  NotificationNewPayload,
} from '@jitplus/shared/src/realtime';
import { queryKeys } from './useQueryHooks';
import { useWsStore } from '@/stores/wsStore';
import type { NotificationsResponse } from '@/types';
import type { InfiniteData } from '@tanstack/react-query';

/** Optimistically increment unread count by 1 for instant badge update. */
function optimisticIncrementUnread(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.cancelQueries({ queryKey: queryKeys.unreadCount });
  const current = queryClient.getQueryData<{ unreadCount: number }>(queryKeys.unreadCount);
  if (current) {
    queryClient.setQueryData(queryKeys.unreadCount, {
      unreadCount: Math.max(0, current.unreadCount + 1),
    });
  }
}

/**
 * Listen for real-time events on the socket and invalidate/update cache.
 * Call this once in your root layout (e.g. RootLayoutNav).
 */
export function useRealtimeEvents(socket: Socket | null) {
  const queryClient = useQueryClient();
  const setWsConnected = useWsStore((s) => s.setConnected);

  useEffect(() => {
    if (!socket) {
      setWsConnected(false);
      return;
    }

    // Track WS connection state for polling hooks
    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    // Set initial state
    setWsConnected(socket.connected);

    // ── Points/stamps balance updated ────────────────────────
    const onPointsUpdated = (payload: PointsUpdatedPayload) => {
      // Invalidate the points overview so it refetches with new balance
      queryClient.invalidateQueries({ queryKey: queryKeys.points });

      if (__DEV__) {
        console.log('[RT] Points updated for merchant', payload.merchantName);
      }
    };

    // ── New notification received ────────────────────────────
    const onNotificationNew = (payload: NotificationNewPayload) => {
      optimisticIncrementUnread(queryClient);

      // Optimistic insert into the first page of the infinite notifications cache
      // instead of invalidating the entire cache (avoids a full refetch).
      queryClient.setQueryData<InfiniteData<NotificationsResponse>>(
        queryKeys.notifications,
        (old) => {
          if (!old?.pages?.length) return old;
          const stub = {
            id: payload.notificationId,
            title: payload.title,
            body: payload.body,
            type: 'info' as const,
            merchantName: null,
            merchantCategory: null,
            merchantLogoUrl: null,
            isRead: false,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          const firstPage = old.pages[0];
          return {
            ...old,
            pages: [
              { ...firstPage, notifications: [stub, ...firstPage.notifications] },
              ...old.pages.slice(1),
            ],
          };
        },
      );
    };

    socket.on(WS_EVENTS.POINTS_UPDATED, onPointsUpdated);
    socket.on(WS_EVENTS.NOTIFICATION_NEW, onNotificationNew);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(WS_EVENTS.POINTS_UPDATED, onPointsUpdated);
      socket.off(WS_EVENTS.NOTIFICATION_NEW, onNotificationNew);
      setWsConnected(false);
    };
  }, [socket, queryClient, setWsConnected]);
}

/**
 * Handle FCM data payloads from push notifications.
 * Call this when a notification is received (foreground, background tap, or cold start).
 * This is the fallback for when the WebSocket is not connected.
 */
export function handleFcmDataPayload(
  data: Record<string, string> | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  if (!data?.event) return;

  switch (data.event) {
    case 'points_updated':
    case 'reward_available':
    case 'reward_redeemed':
      // Only invalidate points — notification list will be refreshed by its own staleTime
      queryClient.invalidateQueries({ queryKey: queryKeys.points });
      break;
    case 'notification_new': {
      // Optimistic +1 badge is enough — skip redundant invalidateQueries on
      // unreadCount to avoid a second network request that overwrites the
      // optimistic value before the server round-trip completes.
      optimisticIncrementUnread(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      break;
    }
    default:
      if (__DEV__) console.log('[FCM] Unhandled event type:', data.event);
  }
}

/**
 * Invalidate notification-related caches when the app returns to foreground
 * after being in background for more than 2 minutes.
 * Avoids unnecessary refetches for quick app switches (e.g. phone calls).
 */
export function useAppForegroundRefresh() {
  const queryClient = useQueryClient();
  const appState = useRef(AppState.currentState);
  const backgroundSince = useRef<number>(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState.match(/inactive|background/)) {
        backgroundSince.current = Date.now();
      }
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        // Only invalidate if app was in background for more than 5 minutes
        const elapsed = Date.now() - backgroundSince.current;
        if (elapsed > 5 * 60 * 1000) {
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
          queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
          queryClient.invalidateQueries({ queryKey: queryKeys.points });
        }
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [queryClient]);
}
