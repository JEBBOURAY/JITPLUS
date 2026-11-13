import { Platform } from 'react-native';
import i18n from '@/i18n';
import { logWarn } from '@/utils/devLogger';
import { isExpoGo, loadNotifications } from '@jitplus/shared/src/expoNotifications';

const Notifications = loadNotifications();

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
 * Must match the channelIds used by the backend (CATEGORY_CHANNEL).
 */
export async function setupAndroidChannels() {
  if (!Notifications || isExpoGo) return;
  if (Platform.OS !== 'android') return;

  try {
    await Promise.all([
      Notifications.setNotificationChannelAsync('jitpro-default', {
        name: i18n.t('notifications.channelDefault'),
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        showBadge: true,
      }),
      Notifications.setNotificationChannelAsync('login-alerts', {
        name: i18n.t('notifications.channelLoginAlerts'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        showBadge: true,
      }),
      // One channel per preference group (backend CATEGORY_CHANNEL), so the
      // merchant can also mute a group from the Android system settings.
      Notifications.setNotificationChannelAsync('jitpro-news', {
        name: i18n.t('notifications.channelNews'),
        importance: Notifications.AndroidImportance.DEFAULT,
        showBadge: true,
      }),
      Notifications.setNotificationChannelAsync('jitpro-tips', {
        name: i18n.t('notifications.channelTips'),
        importance: Notifications.AndroidImportance.DEFAULT,
        showBadge: true,
      }),
      Notifications.setNotificationChannelAsync('jitpro-reminders', {
        name: i18n.t('notifications.channelReminders'),
        importance: Notifications.AndroidImportance.DEFAULT,
        showBadge: true,
      }),
      Notifications.setNotificationChannelAsync('jitpro-reports', {
        name: i18n.t('notifications.channelReports'),
        importance: Notifications.AndroidImportance.DEFAULT,
        showBadge: true,
      }),
    ]);
  } catch (e) {
    logWarn('notifications', 'Failed to create Android channels:', e);
  }
}
