/**
 * Real-time event listener for the client app.
 * Connects to the WebSocket server and auto-invalidates React Query cache
 * when the backend emits events (transaction, notification, etc.).
 *
 * Also handles FCM data payloads for background/offline scenarios.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import {
  WS_EVENTS,
  PointsUpdatedPayload,
  NotificationNewPayload,
} from '@jitplus/shared/src/realtime';
import { queryKeys } from './useQueryHooks';

/**
 * Listen for real-time events on the socket and invalidate/update cache.
 * Call this once in your root layout (e.g. RootLayoutNav).
 */
export function useRealtimeEvents(socket: Socket | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    // ── Points/stamps balance updated ────────────────────────
    const onPointsUpdated = (payload: PointsUpdatedPayload) => {
      // Invalidate the points overview so it refetches with new balance
      queryClient.invalidateQueries({ queryKey: queryKeys.points });

      if (__DEV__) {
        console.log('[RT] Points updated for merchant', payload.merchantName);
      }
    };

    // ── New notification received ────────────────────────────
    const onNotificationNew = (_payload: NotificationNewPayload) => {
      // Cancel in-flight unread-count fetches so they don't overwrite the optimistic value
      queryClient.cancelQueries({ queryKey: queryKeys.unreadCount });

      // Optimistic: increment unread count immediately for instant badge update
      const current = queryClient.getQueryData<{ unreadCount: number }>(queryKeys.unreadCount);
      if (current) {
        queryClient.setQueryData(queryKeys.unreadCount, {
          unreadCount: Math.max(0, current.unreadCount + 1),
        });
      }

      // Invalidate notifications feed (will refetch in background)
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    };

    socket.on(WS_EVENTS.POINTS_UPDATED, onPointsUpdated);
    socket.on(WS_EVENTS.NOTIFICATION_NEW, onNotificationNew);

    return () => {
      socket.off(WS_EVENTS.POINTS_UPDATED, onPointsUpdated);
      socket.off(WS_EVENTS.NOTIFICATION_NEW, onNotificationNew);
    };
  }, [socket, queryClient]);
}

/**
 * Handle FCM data payloads from push notifications.
 * Call this when a notification is received (foreground or background).
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
      // Invalidate points overview cache
      queryClient.invalidateQueries({ queryKey: queryKeys.points });
      // Also invalidate notifications since a notification was created
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
      break;
    case 'notification_new':
      // Broadcast notification received via FCM — invalidate notifications + unread count
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
      break;
  }
}
