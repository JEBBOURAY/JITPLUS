import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '@/services/api';
import { logInfo, logWarn } from '@/utils/devLogger';
import { isNativePushRuntimeAvailable, registerForPushNotifications, setupAndroidChannel } from '@/utils/notifications';

/**
 * Register push notifications when a client is authenticated.
 * Android: requests permission proactively right after login.
 * iOS: defers to the notification tab banner (Apple guidelines).
 */
export function usePushRegistration(clientId: string | undefined) {
  useEffect(() => {
    if (!clientId) return;

    const registerPush = async (retries = 5) => {
      try {
        await setupAndroidChannel();

        if (Platform.OS === 'android') {
          const pushToken = await registerForPushNotifications();
          if (pushToken) {
            const result = await api.updatePushToken(pushToken);
            logInfo('Push', 'Token envoyé au backend (Android):', pushToken.substring(0, 12), result);
          } else if (isNativePushRuntimeAvailable()) {
            logWarn('Push', 'Aucun token obtenu sur Android — notifications ne fonctionneront pas');
          }
        } else {
          const alreadyGranted = await (async () => {
            try {
              const { getPermissionStatus } = require('@/utils/notifications') as typeof import('@/utils/notifications');
              return await getPermissionStatus();
            } catch { return false; }
          })();

          if (alreadyGranted) {
            const pushToken = await registerForPushNotifications();
            if (pushToken) {
              await api.updatePushToken(pushToken);
              logInfo('Push', 'Token envoyé au backend (iOS)');
            }
          } else {
            logInfo('Push', 'Permission iOS pas encore accordée — report à l\'onglet notifications');
          }
        }
      } catch (error) {
        if (retries > 0) {
          const backoff = 2000 * Math.pow(1.5, 5 - retries) + Math.random() * 500;
          await new Promise((r) => setTimeout(r, backoff));
          return registerPush(retries - 1);
        }
        logWarn('Push', 'Échec enregistrement token:', error);
        if (!__DEV__) {
          const Sentry = require('@sentry/react-native');
          Sentry.captureException(error, { tags: { source: 'push-registration' } });
        }
      }
    };

    registerPush();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
}
