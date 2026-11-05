import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Device from 'expo-device';
import { loadNotifications } from '@/utils/expoNotifications';
import { registerPushToken } from '@/contexts/AuthContext';
import { logWarn } from '@/utils/devLogger';
import type { PermissionStatus } from '@/utils/notifPrompt';

export interface NotificationPermission {
  /** null while loading, or when push is unavailable (Expo Go, simulator). */
  status: PermissionStatus | null;
  canAskAgain: boolean;
  /** Shows the system dialog (if still possible) then registers the token. */
  request: () => Promise<PermissionStatus | null>;
  openSystemSettings: () => void;
  refresh: () => Promise<void>;
}

/**
 * OS notification permission of the device, refreshed when the app comes
 * back to the foreground (the merchant may have changed it in the settings).
 */
export function useNotificationPermission(): NotificationPermission {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);

  const refresh = useCallback(async () => {
    const Notif = loadNotifications();
    if (!Notif || !Device.isDevice || typeof Notif.getPermissionsAsync !== 'function') {
      setStatus(null);
      return;
    }
    try {
      const res = await Notif.getPermissionsAsync();
      setStatus(res.status as PermissionStatus);
      setCanAskAgain(res.canAskAgain);
    } catch (e) {
      logWarn('NotifPermission', 'getPermissionsAsync failed', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const request = useCallback(async () => {
    // registerPushToken(true) shows the system dialog when allowed, then
    // sends the token to the backend.
    await registerPushToken(true);
    await refresh();
    const Notif = loadNotifications();
    if (!Notif || typeof Notif.getPermissionsAsync !== 'function') return null;
    const res = await Notif.getPermissionsAsync().catch(() => null);
    return (res?.status as PermissionStatus | undefined) ?? null;
  }, [refresh]);

  const openSystemSettings = useCallback(() => {
    Linking.openSettings().catch((e) => logWarn('NotifPermission', 'openSettings failed', e));
  }, []);

  return { status, canAskAgain, request, openSystemSettings, refresh };
}
