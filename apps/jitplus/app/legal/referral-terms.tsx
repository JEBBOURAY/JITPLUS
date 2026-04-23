import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms, wp } from '@/utils/responsive';
import { SUPPORT_EMAIL } from '@/constants';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function ReferralTermsScreen() {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openEmail = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('legal.referralHeader')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { direction: isRTL ? 'rtl' : 'ltr' }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: `${theme.primary}10` }]}>
          <Text style={[styles.body, { color: theme.textMuted, textAlign: 'center' }]}>
            {t('legal.lastUpdate')}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.refHowTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.refHowBody')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refStep1')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refStep2')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refStep3')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refStep4')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.refConditionsTitle')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refCond1')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refCond2')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refCond3')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refCond4')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.refPayoutTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.refPayoutBody')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refPayout1')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refPayout2')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refPayout3')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refPayout4')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.refFraudTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.refFraudBody')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refFraud1')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refFraud2')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.refFraud3')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.refTaxTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.refTaxBody')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard, marginBottom: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.refContactTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.refContactBody')}{' '}
            <Text style={{ color: theme.primary }} onPress={openEmail}>{SUPPORT_EMAIL}</Text>.
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
