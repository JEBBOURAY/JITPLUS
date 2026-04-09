import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { logWarn } from '@/utils/devLogger';

const isExpoGo = Constants.appOwnership === 'expo';

// Only load expo-notifications outside of Expo Go — the module registers
// push-token side-effects on import that crash in Expo Go SDK 53+.
let Notifications: typeof import('expo-notifications') | null = null;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
  } catch {
    logWarn('notifications', 'expo-notifications unavailable');
  }
}

export { Notifications, isExpoGo };

/**
 * Configure how notifications are displayed when the app is in the foreground.
 * Skipped in Expo Go where the module is unavailable.
 */
if (Notifications && !isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Create the Android notification channels (required for Android 8+).
 * Must match the channelIds used by the backend Firebase service.
 */
export async function setupAndroidChannels() {
  if (!Notifications || isExpoGo) return;
  if (Platform.OS !== 'android') return;

  try {
    await Promise.all([
      Notifications.setNotificationChannelAsync('jitpro-default', {
        name: 'Notifications générales',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        showBadge: true,
      }),
      Notifications.setNotificationChannelAsync('login-alerts', {
        name: 'Alertes de connexion',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        showBadge: true,
      }),
    ]);
  } catch (e) {
    logWarn('notifications', 'Failed to create Android channels:', e);
  }
}
