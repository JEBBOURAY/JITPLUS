import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * Asks for the foreground location with our own explanation first: a refusal
 * in the OS dialog can be permanent, while "Later" on ours keeps the option
 * open. Already granted → `onGranted` runs at once; permanently refused → the
 * alert offers the system settings instead.
 */
export async function promptLocationPermission(t: Translate, onGranted: () => Promise<unknown> | void): Promise<void> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status === 'granted') { await onGranted(); return; }
  if (!perm.canAskAgain) {
    Alert.alert(t('discover.locationPromptTitle'), t('discover.locationBlockedBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
    ]);
    return;
  }
  Alert.alert(t('discover.locationPromptTitle'), t('discover.locationPromptBody'), [
    { text: t('notifications.later'), style: 'cancel' },
    {
      text: t('discover.locationAllow'),
      onPress: () => {
        Location.requestForegroundPermissionsAsync()
          .then(({ status }) => (status === 'granted' ? onGranted() : undefined))
          .catch(() => {});
      },
    },
  ]);
}
