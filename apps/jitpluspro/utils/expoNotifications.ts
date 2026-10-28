import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

// expo-notifications calls requireNativeModule() for these at import time, so
// importing it in a binary that lacks any of them (Expo Go, or a dev client
// built before the SDK upgrade) throws "Cannot find native module ...".
const REQUIRED_NATIVE_MODULES = [
  'ExpoPushTokenManager',
  'ExpoNotificationsEmitter',
  'ExpoNotificationsHandlerModule',
  'ExpoNotificationPermissionsModule',
  'ExpoBadgeModule',
  'NotificationsServerRegistrationModule',
  ...(Platform.OS === 'android'
    ? ['ExpoTopicSubscriptionModule', 'ExpoNotificationChannelManager']
    : []),
];

export const isExpoGo = isRunningInExpoGo();

let cached: NotificationsModule | null | undefined;

/** Returns expo-notifications, or null when the native side is unavailable. */
export function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (isExpoGo) return cached;

  const missing = REQUIRED_NATIVE_MODULES.filter((name) => !requireOptionalNativeModule(name));
  if (missing.length > 0) {
    if (__DEV__) console.warn(`[notifications] native modules missing (${missing.join(', ')}), rebuild the dev client`);
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    if (__DEV__) console.warn('[notifications] expo-notifications unavailable', e);
  }
  return cached;
}
