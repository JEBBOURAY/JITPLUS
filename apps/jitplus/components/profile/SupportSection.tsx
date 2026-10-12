import { memo, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { FileText, MessageCircle, Shield, Star } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getReviewUrl, getStoreUrl, SUPPORT_EMAIL } from '@/constants';
import SettingsGroup from './SettingsGroup';
import SettingsRow from './SettingsRow';

const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212755073325';

function SupportSection() {
  const router = useRouter();
  const { t } = useLanguage();

  const contactSupport = useCallback(async () => {
    const msg = encodeURIComponent(t('profile.supportMessage'));
    try {
      await Linking.openURL(`whatsapp://send?phone=${SUPPORT_WHATSAPP}&text=${msg}`);
    } catch {
      Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${msg}`)
        .catch(() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Support&body=${msg}`))
        .catch(() => Alert.alert(t('common.error'), t('profile.supportError')));
    }
  }, [t]);

  const rateApp = useCallback(async () => {
    const reviewUrl = getReviewUrl();
    try {
      await Linking.openURL((await Linking.canOpenURL(reviewUrl)) ? reviewUrl : getStoreUrl());
    } catch {
      Linking.openURL(getStoreUrl()).catch(() => {});
    }
  }, []);

  const openPrivacy = useCallback(() => router.push('/legal/privacy'), [router]);
  const openTerms = useCallback(() => router.push('/legal/terms'), [router]);

  return (
    <SettingsGroup title={t('profile.helpGroup')}>
      <SettingsRow
        icon={MessageCircle}
        title={t('profile.contactSupport')}
        subtitle={t('profile.contactSupportDesc')}
        onPress={contactSupport}
      />
      <SettingsRow
        icon={Star}
        tint={palette.gold}
        title={t('profile.rateApp')}
        subtitle={t('profile.rateAppDesc')}
        onPress={rateApp}
      />
      <SettingsRow
        icon={Shield}
        title={t('profile.legalNotice')}
        subtitle={t('profile.legalNoticeDesc')}
        onPress={openPrivacy}
      />
      <SettingsRow
        icon={FileText}
        title={t('profile.termsOfUse')}
        subtitle={t('profile.termsOfUseDesc')}
        onPress={openTerms}
      />
    </SettingsGroup>
  );
}

export default memo(SupportSection);
