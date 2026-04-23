import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms, wp } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function TermsScreen() {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('legal.termsHeader')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { direction: isRTL ? 'rtl' : 'ltr' }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: `${theme.primary}10` }]}>
          <Text style={[styles.body, { color: theme.textMuted, textAlign: 'center' }]}>
            {t('legal.lastUpdate')}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.cguBody')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguFree')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguNoValue')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguModify')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguLaw')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguAcceptanceTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.cguAcceptanceBody')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguEligibilityTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.cguEligibilityBody')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguRulesTitle')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguRule1')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguRule2')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguRule3')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguRule4')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguSuspendTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.cguSuspendBody')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguLiabilityTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.cguLiabilityBody')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.wheelRulesTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.wheelRulesIntro')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.wheelRulesEarn')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.wheelRulesOdds')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.wheelRulesClaim')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.wheelRulesPrizes')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.wheelRulesFraud')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.wheelRulesDisclaimer')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard, marginBottom: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguJurisdictionTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('legal.cguJurisdictionBody')}</Text>
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
