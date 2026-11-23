import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadNotifications } from '@jitplus/shared/src/expoNotifications';
import { PUSH_BANNER_DISMISSED_KEY } from '@/constants';
import { api } from '@/services/api';
import {
  canAskPermission, getPermissionStatus, isNativePushRuntimeAvailable, registerForPushNotifications,
} from '@/utils/notifications';

/** "unknown": no native push here (Expo Go, module missing): nothing to offer. */
export type PushPermission = 'granted' | 'denied' | 'unknown';

/** "Later" on the push banner hides it for a week. */
const PUSH_BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const Notifications = loadNotifications();

function syncPushToken() {
  return registerForPushNotifications()
    .then((pushToken) => (pushToken ? api.updatePushToken(pushToken) : undefined))
    .catch(() => {});
}

export async function openNotificationSettings() {
  try {
    if (Platform.OS === 'ios') await Linking.openURL('app-settings:');
    else await Linking.openSettings();
  } catch { /* settings unavailable */ }
}

/**
 * Push permission of the notifications screen and its "turn on" banner.
 * `check` re-reads the OS status (call it on focus and when the app comes
 * back from Settings): a grant made in Settings registers the push token, since
 * usePushRegistration only runs at login and cold start.
 */
export function usePushPermission() {
  const [permission, setPermission] = useState<PushPermission>('unknown');
  // Hidden until the stored "Later" is read, so a snoozed banner never flashes.
  const [bannerDismissed, setBannerDismissed] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(PUSH_BANNER_DISMISSED_KEY)
      .then((v) => {
        const at = Number(v);
        setBannerDismissed(!!v && Number.isFinite(at) && Date.now() - at < PUSH_BANNER_SNOOZE_MS);
      })
      .catch(() => setBannerDismissed(false));
  }, []);

  // Last status seen, to spot a grant made outside the app.
  const lastRef = useRef<PushPermission | null>(null);

  const check = useCallback(async () => {
    if (!isNativePushRuntimeAvailable()) { setPermission('unknown'); return; }
    const next: PushPermission = (await getPermissionStatus()) ? 'granted' : 'denied';
    const previous = lastRef.current;
    lastRef.current = next;
    setPermission(next);
    if (next === 'granted' && previous !== null && previous !== 'granted') void syncPushToken();
  }, []);

  /** Shows the OS prompt, or Settings once the OS won't ask again. True when granted. */
  const request = useCallback(async (): Promise<boolean> => {
    if (!Notifications || !isNativePushRuntimeAvailable() || !(await canAskPermission())) {
      await openNotificationSettings();
      return false;
    }
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') { lastRef.current = 'denied'; return false; }
      lastRef.current = 'granted';
      setPermission('granted');
      void syncPushToken();
      return true;
    } catch {
      await openNotificationSettings();
      return false;
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    AsyncStorage.setItem(PUSH_BANNER_DISMISSED_KEY, String(Date.now())).catch(() => {});
  }, []);

  return {
    permission,
    showBanner: permission === 'denied' && !bannerDismissed,
    check,
    request,
    dismissBanner,
  };
}
