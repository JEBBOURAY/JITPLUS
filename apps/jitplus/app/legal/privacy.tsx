import { Linking } from 'react-native';
import { Text } from '@/components/AppText';
import { LegalBody, LegalBullet, LegalNotice, LegalScreen, LegalSection } from '@/components/legal/LegalScreen';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORT_EMAIL } from '@/constants';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const CNDP_URL = 'https://www.cndp.ma';

export default function PrivacyScreen() {
  const theme = useTheme();
  const { t } = useLanguage();

  const openEmail = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
  const openCndp = () => Linking.openURL(CNDP_URL).catch(() => {});

  return (
    <LegalScreen title={t('legal.privacyHeader')} directional>
      <LegalNotice>{t('legal.lastUpdate')}</LegalNotice>

      <LegalSection title={t('legal.cndpTitle')}>
        <LegalBody>
          {t('legal.cndpIntro')}{' '}
          <Text style={{ fontWeight: '600', color: theme.text }}>{t('legal.cndpBody')}</Text>
          {t('legal.cndpRights')}
        </LegalBody>
        <LegalBullet>{t('legal.rightAccess')}</LegalBullet>
        <LegalBullet>{t('legal.rightRectify')}</LegalBullet>
        <LegalBullet>{t('legal.rightDelete')}</LegalBullet>
        <LegalBullet>{t('legal.rightOppose')}</LegalBullet>
        <LegalBody style={{ color: theme.textMuted, marginTop: 8 }}>
          {t('legal.cndpExercise')}{' '}
          <Text style={{ color: theme.primary }} onPress={openEmail}>{SUPPORT_EMAIL}</Text>.
        </LegalBody>
      </LegalSection>

      <LegalSection
        title={t('legal.dataTitle')}
        body={t('legal.dataIntro')}
        bullets={[
          t('legal.dataPhone'), t('legal.dataName'), t('legal.dataDob'),
          t('legal.dataLocation'), t('legal.dataHistory'), t('legal.dataNotifPrefs'),
        ]}
      />
      <LegalSection title={t('legal.usageTitle')} body={t('legal.usageBody')} />
      <LegalSection title={t('legal.retentionTitle')} body={t('legal.retentionBody')} />
      <LegalSection title={t('legal.contactTitle')} last>
        <LegalBody>
          {t('legal.contactResponsible')}{'\n'}
          {t('legal.contactEmail')} <Text style={{ color: theme.primary }} onPress={openEmail}>{SUPPORT_EMAIL}</Text>{'\n'}
          {t('legal.contactCndp')}{' '}
          <Text style={{ color: theme.primary }} onPress={openCndp}>www.cndp.ma</Text>
        </LegalBody>
      </LegalSection>
    </LegalScreen>
  );
}
