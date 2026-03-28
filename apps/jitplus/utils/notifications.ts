import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import i18n from '@/i18n';

const isExpoGo = Constants.appOwnership === 'expo';
let didLogPushSkip = false;

// Only load expo-notifications outside of Expo Go — the module registers
// push-token side-effects on import that crash in Expo Go SDK 53+.
let Notifications: typeof import('expo-notifications') | null = null;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
  } catch {
    if (__DEV__) console.warn('[notifications] expo-notifications unavailable');
  }
}

/** True when native push APIs are available in the current runtime. */
export function isNativePushRuntimeAvailable(): boolean {
  return !!Notifications && !isExpoGo;
}

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
 * Check if notification permission is already granted.
 * Safe to call in Expo Go — returns false when the module is unavailable.
 */
export async function getPermissionStatus(): Promise<boolean> {
  if (!Notifications || isExpoGo) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

/**
 * Create the Android notification channel (required for Android 8+).
 * Must match the channelId used by the backend Firebase service ('jit-marketing').
 */
export async function setupAndroidChannel() {
  if (!Notifications || isExpoGo) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('jit-marketing', {
      name: i18n.t('notifications.channelOffers'),
      description: i18n.t('notifications.channelOffersDesc'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED',
      showBadge: true,
      // Do not pass sound: 'default' — expo-notifications treats the
      // string as a filename in res/raw/. Use null to inherit device default.
      sound: null,
    });

    // Default channel for general notifications
    await Notifications.setNotificationChannelAsync('default', {
      name: i18n.t('notifications.channelGeneral'),
      importance: Notifications.AndroidImportance.HIGH,
      showBadge: true,
      sound: null,
    });
  }
}

/** Max retries when fetching the native FCM/APNs token (first launch can be slow). */
const TOKEN_MAX_RETRIES = 3;
const TOKEN_RETRY_DELAY_MS = 2_000;

/**
 * Request notification permissions and return the native FCM/APNs device token.
 * Returns null if permissions are denied or device is not physical.
 *
 * IMPORTANT: Only native device tokens (FCM on Android, APNs on iOS) are returned.
 * Expo Push Tokens are NOT supported — the backend uses Firebase Admin SDK which
 * can only deliver to native tokens.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications don't work in Expo Go (SDK 53+)
  if (!Notifications || isExpoGo) {
    if (__DEV__ && !didLogPushSkip) {
      console.log('Push notifications skipped (Expo Go or module unavailable)');
      didLogPushSkip = true;
    }
    return null;
  }

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    if (__DEV__) console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) console.log('Notification permission not granted');
    return null;
  }

  // Get the native device push token (FCM on Android, APNs on iOS).
  // Retry up to TOKEN_MAX_RETRIES times — on first launch after install,
  // Firebase may not have registered with Google servers yet.
  for (let attempt = 1; attempt <= TOKEN_MAX_RETRIES; attempt++) {
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const token = typeof tokenData.data === 'string' ? tokenData.data : String(tokenData.data);

      if (__DEV__) console.log(`Device push token (attempt ${attempt}):`, token);
      return token;
    } catch (error) {
      if (__DEV__) console.error(`Failed to get device push token (attempt ${attempt}/${TOKEN_MAX_RETRIES}):`, error);

      if (attempt < TOKEN_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, TOKEN_RETRY_DELAY_MS));
      }
    }
  }

  // All retries exhausted — do NOT fall back to Expo push tokens.
  // The backend uses Firebase Admin SDK which only accepts native tokens.
  if (__DEV__) console.warn('[Push] Could not obtain native device push token after retries');
  return null;
}
