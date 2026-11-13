import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { api } from '@/services/api';
import { handleFcmDataPayload, pushStampsEventFromNotification } from '@/hooks/useRealtimeEvents';
import { resolveNotificationRoute, type NotificationData } from '@/utils/notificationRouting';
import { loadNotifications } from '@jitplus/shared/src/expoNotifications';

/** Identifier of the last notification whose tap was routed (survives effect re-runs). */
let lastOpenedId: string | undefined;

/** Push token rotation, foreground notifications, and notification taps (warm and cold start). */
export function useNotificationListeners(): void {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const N = loadNotifications();
    if (!N) return;

    type Tapped = { request: { identifier: string; content: { data?: unknown } } };
    // A cold-start tap is reported by both the response listener and
    // getLastNotificationResponseAsync: open its screen once.
    const openOnce = (notification: Tapped) => {
      const id = notification.request.identifier;
      if (id && id === lastOpenedId) return;
      lastOpenedId = id;
      const data = dataOf(notification);
      handleFcmDataPayload(data, queryClient);
      open(data);
    };
    const open = (data: NotificationData) => {
      try {
        router.push(resolveNotificationRoute(data));
      } catch (e) { if (__DEV__) console.warn('Navigation failed', e); }
    };
    const dataOf = (n: { request: { content: { data?: unknown } } }) => n.request.content.data as NotificationData;

    // Convert the rotated device token to an Expo push token so the backend keeps a valid
    // ExponentPushToken[…] (raw APNs tokens are rejected by Firebase Admin SDK on iOS).
    // Pass `devicePushToken` through: without it getExpoPushTokenAsync calls native
    // registerForRemoteNotifications, which fires this listener again — an endless
    // loop on iOS that piles up exp.host requests until Hermes aborts (Sentry JITPLUS-MOBILE-J).
    const tokenSub = N.addPushTokenListener(async (devicePushToken) => {
      if (__DEV__) console.log('Push token rotated, re-registering');
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const expoTokenData = await N.getExpoPushTokenAsync({ projectId, devicePushToken });
        await api.updatePushToken(String(expoTokenData.data));
      } catch (e) {
        if (__DEV__) console.warn('Failed to refresh Expo Push Token on rotation', e);
      }
    });

    N.setBadgeCountAsync(0).catch(() => {});

    // Foreground: invalidate caches from the payload (fallback when the WebSocket is offline).
    const receivedSub = N.addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log('Notification received:', notification.request.content);
      const data = dataOf(notification);
      handleFcmDataPayload(data, queryClient);
      pushStampsEventFromNotification(data, queryClient);
    });

    const responseSub = N.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) console.log('Notification tapped:', response.notification.request.content);
      N.setBadgeCountAsync(0).catch(() => {});
      openOnce(response.notification);
    });

    // Cold start: the app was launched by tapping a notification.
    N.getLastNotificationResponseAsync().then((response) => {
      if (response) openOnce(response.notification);
    }).catch(() => {});

    return () => {
      tokenSub.remove();
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router, queryClient]);
}
