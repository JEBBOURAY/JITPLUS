import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { haptic, HapticStyle } from '@/utils/haptics';
import { getPermissionStatus, isNativePushRuntimeAvailable } from '@/utils/notifications';

export type PreferenceKey = 'shareInfoMerchants' | 'notifPush' | 'notifEmail';

function patchClient(key: PreferenceKey, value: boolean) {
  const { client, setClient } = useAuthStore.getState();
  if (client) setClient({ ...client, [key]: value });
}

/**
 * Optimistic preference toggle. The auth store is patched locally (no profile
 * refetch) and rolled back if the PATCH fails.
 */
export function usePreferenceToggle() {
  const { t } = useLanguage();
  const [savingKey, setSavingKey] = useState<PreferenceKey | null>(null);

  const toggle = useCallback(async (key: PreferenceKey) => {
    const current = useAuthStore.getState().client?.[key] ?? true;
    const next = !current;

    // Enabling the DB flag alone is misleading when the OS blocks notifications.
    if (key === 'notifPush' && next && isNativePushRuntimeAvailable()) {
      const granted = await getPermissionStatus();
      if (!granted) {
        Alert.alert(t('profile.pushPermissionTitle'), t('profile.pushPermissionBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
    }

    haptic(HapticStyle.Light);
    setSavingKey(key);
    patchClient(key, next);
    try {
      await api.updateProfile({ [key]: next });
    } catch {
      patchClient(key, current);
      Alert.alert(t('common.error'), t('profile.updateError'));
    } finally {
      setSavingKey(null);
    }
  }, [t]);

  return { toggle, savingKey };
}
