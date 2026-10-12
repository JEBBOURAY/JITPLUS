import { memo, useCallback, useState } from 'react';
import { Bell, Globe, Mail, Palette } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { usePreferenceToggle } from '@/hooks/usePreferenceToggle';
import { haptic, HapticStyle } from '@/utils/haptics';
import SettingsGroup from './SettingsGroup';
import SettingsRow from './SettingsRow';
import ThemeSegmented from './ThemeSegmented';
import LanguageModal from './LanguageModal';

function PreferencesSection() {
  const { t, locale } = useLanguage();
  const notifPush = useAuthStore((s) => s.client?.notifPush ?? true);
  const notifEmail = useAuthStore((s) => s.client?.notifEmail ?? true);
  const { toggle, savingKey } = usePreferenceToggle();
  const [showLanguage, setShowLanguage] = useState(false);

  const openLanguage = useCallback(() => { haptic(HapticStyle.Light); setShowLanguage(true); }, []);
  const closeLanguage = useCallback(() => setShowLanguage(false), []);
  const togglePush = useCallback(() => toggle('notifPush'), [toggle]);
  const toggleEmail = useCallback(() => toggle('notifEmail'), [toggle]);

  return (
    <>
      <SettingsGroup title={t('profile.preferences')}>
        <SettingsRow icon={Palette} title={t('profile.darkMode')} accessory="none">
          <ThemeSegmented />
        </SettingsRow>
        <SettingsRow
          icon={Globe}
          title={t('profile.language')}
          valueText={t(`languages.${locale}`)}
          onPress={openLanguage}
        />
      </SettingsGroup>

      <SettingsGroup title={t('profile.notificationsGroup')}>
        <SettingsRow
          icon={Bell}
          title={t('profile.pushNotifs')}
          subtitle={t('profile.pushNotifsDesc')}
          accessory="switch"
          checked={notifPush}
          disabled={savingKey === 'notifPush'}
          onPress={togglePush}
        />
        <SettingsRow
          icon={Mail}
          title={t('profile.emailNotifs')}
          subtitle={t('profile.emailNotifsDesc')}
          accessory="switch"
          checked={notifEmail}
          disabled={savingKey === 'notifEmail'}
          onPress={toggleEmail}
        />
      </SettingsGroup>

      <LanguageModal visible={showLanguage} onClose={closeLanguage} />
    </>
  );
}

export default memo(PreferencesSection);
