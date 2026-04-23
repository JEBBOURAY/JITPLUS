import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms, wp } from '@/utils/responsive';
import { SUPPORT_EMAIL } from '@/constants';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const CNDP_URL = 'https://www.cndp.ma';

export default function PrivacyScreen() {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openEmail = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
  const openCndp = () => Linking.openURL(CNDP_URL).catch(() => {});

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('legal.privacyHeader')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { direction: isRTL ? 'rtl' : 'ltr' }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: `${theme.primary}10` }]}>
          <Text style={[styles.body, { color: theme.textMuted, textAlign: 'center' }]}>
            {t('legal.lastUpdate')}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cndpTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.cndpIntro')}{' '}
            <Text style={{ fontWeight: '700', color: theme.text }}>{t('legal.cndpBody')}</Text>
            {t('legal.cndpRights')}
          </Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightAccess')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightRectify')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightDelete')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightOppose')}</Text>
          <Text style={[styles.body, { color: theme.textMuted, marginTop: 8 }]}>
            {t('legal.cndpExercise')}{' '}
            <Text style={{ color: theme.primary }} onPress={openEmail}>{SUPPORT_EMAIL}</Text>.
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.dataTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.dataIntro')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataPhone')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataName')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataDob')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataLocation')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataHistory')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataNotifPrefs')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.usageTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.usageBody')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.retentionTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.retentionBody')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard, marginBottom: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.contactTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.contactResponsible')}{'\n'}
            {t('legal.contactEmail')} <Text style={{ color: theme.primary }} onPress={openEmail}>{SUPPORT_EMAIL}</Text>{'\n'}
            {t('legal.contactCndp')}{' '}
            <Text style={{ color: theme.primary }} onPress={openCndp}>www.cndp.ma</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: ms(40), alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: ms(16), fontWeight: '700' },
  content: { padding: 16, gap: 12 },
  section: { borderRadius: 14, padding: 16, gap: 6 },
  sectionTitle: { fontSize: ms(14), fontWeight: '700', marginBottom: 6 },
  body: { fontSize: ms(13), lineHeight: ms(21) },
  bullet: { fontSize: ms(13), lineHeight: ms(20), paddingLeft: wp(4) },
});
