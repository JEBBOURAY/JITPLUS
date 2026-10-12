import { memo, useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { FileDown, Lock, Share2 } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { usePreferenceToggle } from '@/hooks/usePreferenceToggle';
import { api } from '@/services/api';
import { haptic, HapticStyle } from '@/utils/haptics';
import SettingsGroup from './SettingsGroup';
import SettingsRow from './SettingsRow';

function SecuritySection() {
  const router = useRouter();
  const { t } = useLanguage();
  const hasPassword = useAuthStore((s) => !!s.client?.hasPassword);
  const shareInfo = useAuthStore((s) => s.client?.shareInfoMerchants ?? true);
  const { toggle, savingKey } = usePreferenceToggle();
  const [isExporting, setIsExporting] = useState(false);

  const openPassword = useCallback(() => router.push('/change-password'), [router]);
  const toggleShare = useCallback(() => toggle('shareInfoMerchants'), [toggle]);

  const exportData = useCallback(() => {
    const run = async () => {
      haptic(HapticStyle.Light);
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDir) { Alert.alert(t('common.error'), t('profile.exportDataError')); return; }
      setIsExporting(true);
      const fileUri = `${baseDir}jitplus-donnees-personnelles.json`;
      try {
        const data = await api.exportPersonalData();
        await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: t('profile.exportData') });
        } else {
          Alert.alert(t('profile.exportDataSuccess'), t('profile.exportDataSuccessMsg'));
        }
      } catch (err) {
        if (__DEV__) console.error('Export error:', err);
        Alert.alert(t('common.error'), t('profile.exportDataError'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.retry'), onPress: () => { run(); } },
        ]);
      } finally {
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        setIsExporting(false);
      }
    };
    run();
  }, [t]);

  return (
    <SettingsGroup title={t('profile.securityGroup')}>
      <SettingsRow
        icon={Lock}
        title={hasPassword ? t('profile.changePassword') : t('profile.setPasswordLink')}
        subtitle={hasPassword ? t('profile.changePasswordDesc') : t('profile.setPasswordLinkDesc')}
        onPress={openPassword}
      />
      <SettingsRow
        icon={Share2}
        title={t('profile.shareInfo')}
        subtitle={t('profile.shareInfoDesc')}
        accessory="switch"
        checked={shareInfo}
        disabled={savingKey === 'shareInfoMerchants'}
        onPress={toggleShare}
      />
      <SettingsRow
        icon={FileDown}
        title={t('profile.exportData')}
        subtitle={isExporting ? t('profile.exportDataLoading') : t('profile.exportDataDesc')}
        accessory="none"
        loading={isExporting}
        onPress={exportData}
      />
    </SettingsGroup>
  );
}

export default memo(SecuritySection);
