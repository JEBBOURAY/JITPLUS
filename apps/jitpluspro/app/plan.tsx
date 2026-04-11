import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Crown,
  Check,
  X,
  Zap,
  Users,
  Store,
  Bell,
  MessageSquare,
  Mail,
  BarChart3,
  Gift,
  Phone,
  Repeat,
  UserCheck,
  QrCode,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { BlurView } from 'expo-blur';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlan, useReferral, useApplyReferralMonths } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';

// â”€â”€ Contact info for support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const UPGRADE_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || (__DEV__ ? '212600000000' : '');
const UPGRADE_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'contact@jitplus.com';

interface FeatureRow {
  icon: React.ReactNode;
  label: string;
  free: string | boolean;
  premium: string | boolean;
}

// â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function PlanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const { merchant, isTeamMember } = useAuth();

  const { data: planInfo, isLoading: loading } = usePlan();
  const { data: referral } = useReferral(!isTeamMember);
  const applyReferralMutation = useApplyReferralMonths();
  const [applyingMonths, setApplyingMonths] = useState(false);

  const handleApplyReferralMonths = async () => {
    if (!referral || referral.referralMonthsEarned <= 0) return;
    Alert.alert(
      t('account.planReferralAlertTitle'),
      t('account.planReferralAlertMsg', { count: referral.referralMonthsEarned }),
      [
        { text: t('account.planReferralAlertCancel'), style: 'cancel' },
        {
          text: t('account.planReferralAlertConfirm'),
          onPress: async () => {
            setApplyingMonths(true);
            try {
              await applyReferralMutation.mutateAsync();
              Alert.alert(t('account.planReferralSuccess'), t('account.planReferralSuccessMsg'));
            } catch (e) {
              Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
            } finally {
              setApplyingMonths(false);
            }
          },
        },
      ],
    );
  };

  const handleContactWhatsApp = () => {
    if (!UPGRADE_WHATSAPP) {
      Alert.alert(t('common.error'), t('account.planErrorWhatsapp'));
      return;
    }
    const msg = encodeURIComponent(
      t('account.planContactWhatsappMsg', { name: merchant?.nom ?? '', email: merchant?.email ?? '' }),
    );
    Linking.openURL(`https://wa.me/${UPGRADE_WHATSAPP}?text=${msg}`).catch(() =>
      Alert.alert(t('common.error'), t('account.planErrorWhatsapp')),
    );
  };

  const handleContactEmail = () => {
    const subject = encodeURIComponent(t('account.planContactEmailSubject'));
    const body = encodeURIComponent(
      t('account.planContactEmailBody', { name: merchant?.nom ?? '', email: merchant?.email ?? '' }),
    );
    Linking.openURL(`mailto:${UPGRADE_EMAIL}?subject=${subject}&body=${body}`).catch(() =>
      Alert.alert(t('common.error'), t('account.planErrorEmail')),
    );
  };

  // â”€â”€ Derived â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isPremium = planInfo?.plan === 'PREMIUM';
  const isTrial = isPremium && planInfo?.isTrial;
  const isAdminActivated = isPremium && planInfo?.planActivatedByAdmin;
  const trialProgress =
    isTrial && planInfo?.daysRemaining != null
      ? Math.max(0, Math.min(1, planInfo.daysRemaining / 30))
      : 0;

  const features: FeatureRow[] = [
    {
      icon: <Repeat size={16} color={theme.primary} />,
      label: t('account.planFeatureLoyalty'),
      free: t('account.planFeatureLoyaltyFree'),
      premium: t('account.planFeatureLoyaltyPremium'),
    },
    {
      icon: <Store size={16} color={theme.primary} />,
      label: t('account.planFeatureStores'),
      free: t('account.planFeatureStoresFree'),
      premium: t('account.planFeatureStoresPremium'),
    },
    {
      icon: <Users size={16} color={theme.primary} />,
      label: t('account.planFeatureClients'),
      free: t('account.planFeatureClientsFree'),
      premium: t('account.planFeatureClientsPremium'),
    },
    {
      icon: <QrCode size={16} color={theme.primary} />,
      label: t('account.planFeatureQr'),
      free: true,
      premium: true,
    },
    {
      icon: <BarChart3 size={16} color={theme.primary} />,
      label: t('account.planFeatureDashboard'),
      free: false,
      premium: true,
    },
    {
      icon: <Bell size={16} color={theme.primary} />,
      label: t('account.planFeaturePush'),
      free: true,
      premium: t('account.planFeaturePushPremium'),
    },
    {
      icon: <MessageSquare size={16} color={theme.primary} />,
      label: t('account.planFeatureMessages'),
      free: false,
      premium: t('account.planFeatureMessagesPremium'),
    },
    {
      icon: <UserCheck size={16} color={theme.primary} />,
      label: t('account.planFeatureTeam'),
      free: false,
      premium: true,
    },
    {
      icon: <Gift size={16} color={theme.primary} />,
      label: t('account.planFeatureGifts'),
      free: t('account.planFeatureGiftsFree'),
      premium: t('account.planFeatureGiftsPremium'),
    },
    {
      icon: <BarChart3 size={16} color={theme.primary} />,
      label: t('account.planFeatureLoyaltySettings'),
      free: false,
      premium: true,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* â”€â”€ Header â”€â”€ */}
      <View collapsable={false}>
        <LinearGradient
          colors={[...brandGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 20}
            tint={theme.mode === 'dark' ? 'dark' : 'default'}
            style={[styles.headerBlur, { paddingTop: insets.top + 16 }]}
          >
            <View style={styles.glassOverlay} />
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <ArrowLeft size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{t('account.planPageTitle')}</Text>
              <View style={{ width: 40 }} />
            </View>
          </BlurView>
        </LinearGradient>
        <LinearGradient
          colors={['rgba(124,58,237,0.3)', 'transparent']}
          style={styles.headerFade}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 50 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Guide text ── */}
          <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
            <Text style={[styles.guideText, { color: theme.textSecondary }]}>
              {t('account.planGuideText')}
            </Text>
          </View>
          {/* â”€â”€ Hero plan card â”€â”€ */}
          <LinearGradient
            colors={isPremium ? ['#4C1D95', '#7C3AED', '#1F2937'] : [theme.bgCard, theme.bgCard]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, !isPremium && { borderColor: theme.border, borderWidth: 1 }]}
          >
            <View style={[styles.heroBadge, { backgroundColor: isPremium ? 'rgba(255,255,255,0.15)' : theme.border + '55' }]}>
              {isTrial
                ? <Zap size={12} color={isPremium ? '#FCD34D' : theme.textMuted} strokeWidth={1.5} />
                : <Crown size={12} color={isPremium ? '#FCD34D' : theme.textMuted} strokeWidth={1.5} />}
              <Text style={[styles.heroBadgeText, { color: isPremium ? '#FCD34D' : theme.textMuted }]}>
                {isTrial ? t('account.planBadgeTrial') : isPremium ? t('account.planBadgePro') : t('account.planBadgeFree')}
              </Text>
            </View>

            <View style={styles.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroTitle, { color: isPremium ? '#fff' : theme.text }]}>
                  {(isAdminActivated && !planInfo?.planExpiresAt)
                    ? t('account.planHeroTitlePro')
                    : (isAdminActivated && planInfo?.planExpiresAt)
                    ? t('account.planHeroTitlePro')
                    : isTrial
                    ? t('account.planHeroTitleTrial')
                    : t('account.planHeroTitleFree')}
                </Text>
                <Text style={[styles.heroSub, { color: isPremium ? 'rgba(255,255,255,0.72)' : theme.textMuted }]}>
                  {(isAdminActivated && !planInfo?.planExpiresAt)
                    ? t('account.planHeroSubUnlimited')
                    : (isAdminActivated && planInfo?.planExpiresAt)
                    ? t('account.planHeroSubValidUntil', { date: (() => { const d = new Date(planInfo!.planExpiresAt!); return isNaN(d.getTime()) ? 'â€”' : d.toLocaleDateString(locale === 'ar' ? 'ar-MA' : locale, { day: '2-digit', month: 'long', year: 'numeric' }); })() })
                    : isTrial
                    ? t('account.planHeroSubTrialDays', { count: planInfo?.daysRemaining ?? 0 })
                    : t('account.planHeroSubFree')}
                </Text>
              </View>
              <Crown size={46} color={isPremium ? 'rgba(252,211,77,0.85)' : theme.borderLight} strokeWidth={1.5} />
            </View>

            {/* Barre de progression essai */}
            {isTrial && planInfo?.daysRemaining != null && (
              <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <View style={[styles.progressFill, { width: `${Math.round(trialProgress * 100)}%` as `${number}%` }]} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                  <Text style={styles.progressText}>{t('account.planTrialLabel')}</Text>
                  <Text style={styles.progressText}>{t('account.planTrialProgress', { remaining: planInfo.daysRemaining, total: 30 })}</Text>
                </View>
              </View>
            )}

            {/* Chip jours restants pour abonnement payÃ© */}
            {!!isAdminActivated && !!planInfo?.planExpiresAt && planInfo?.daysRemaining != null && (
              <View style={styles.expiryChip}>
                <Text style={styles.expiryChipText}>{t('account.planExpiryDaysChip', { count: planInfo.daysRemaining })}</Text>
              </View>
            )}
          </LinearGradient>

          {/* â”€â”€ Parrainage CTA â”€â”€ */}
          {!isPremium && referral && referral.referralMonthsEarned > 0 && (
            <TouchableOpacity
              style={[styles.referralCard, { backgroundColor: palette.cyan + '15', borderColor: palette.cyan }]}
              onPress={handleApplyReferralMonths}
              disabled={applyingMonths}
            >
              {applyingMonths ? (
                <ActivityIndicator size="small" color={palette.cyan} />
              ) : (
                <>
                  <Gift size={22} color={palette.cyan} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.referralTitle, { color: palette.cyan }]}>
                      {t('account.planReferralTitle', { count: referral.referralMonthsEarned })}
                    </Text>
                    <Text style={[styles.referralSub, { color: theme.textMuted }]}>
                      {t('account.planReferralSub')}
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* â”€â”€ Comparaison des fonctionnalit\u00e9s â”€â”€ */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('account.planFeaturesTitle')}</Text>
            <View style={[styles.tableCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <View style={[styles.tableHead, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 2 }} />
                <View style={styles.tableHeadCell}>
                  <Text style={[styles.tableHeadLabel, { color: theme.textMuted }]}>{t('account.planTableFree')}</Text>
                </View>
                <View style={[styles.tableHeadCell, { backgroundColor: '#37415115', borderRadius: 8, paddingHorizontal: 4 }]}>
                  <Crown size={11} color={palette.violet} />
                  <Text style={[styles.tableHeadLabel, { color: palette.violet }]}>{t('account.planTablePro')}</Text>
                </View>
              </View>
              {features.map((f, i) => (
                <View
                  key={i}
                  style={[
                    styles.tableRow,
                    i < features.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                  ]}
                >
                  <View style={styles.rowLabel}>
                    {f.icon}
                    <Text style={[styles.rowLabelText, { color: theme.textSecondary }]} numberOfLines={2}>{f.label}</Text>
                  </View>
                  <View style={styles.rowCell}>
                    {typeof f.free === 'boolean'
                      ? f.free ? <Check size={16} color={palette.violet} /> : <X size={15} color={theme.textMuted + '66'} />
                      : <Text style={[styles.cellVal, { color: theme.textMuted }]}>{f.free}</Text>}
                  </View>
                  <View style={[styles.rowCell, { backgroundColor: '#37415110' }]}>
                    {typeof f.premium === 'boolean'
                      ? f.premium ? <Check size={16} color={palette.violet} /> : <X size={15} color={theme.textMuted + '66'} />
                      : <Text style={[styles.cellVal, { color: palette.violet, fontWeight: '700' }]}>{f.premium}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* â”€â”€ Actions â”€â”€ */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {isPremium ? t('account.planSectionManage') : t('account.planSectionUpgrade')}
            </Text>

            {/* WhatsApp */}
            <TouchableOpacity
              style={[styles.btnOutline, { backgroundColor: '#25D36610', borderColor: '#25D36650' }]}
              onPress={handleContactWhatsApp}
              activeOpacity={0.75}
            >
              <View style={[styles.btnIcon, { backgroundColor: '#25D36622' }]}>
                <Phone size={17} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.btnOutlineTitle, { color: theme.text }]}>{isPremium ? t('account.planWhatsapp') : 'WhatsApp'}</Text>
                <Text style={[styles.btnOutlineSub, { color: theme.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>{t('account.planWhatsappSub')}</Text>
              </View>
            </TouchableOpacity>

            {/* Email */}
            <TouchableOpacity
              style={[styles.btnOutline, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={handleContactEmail}
              activeOpacity={0.75}
            >
              <View style={[styles.btnIcon, { backgroundColor: theme.primary + '18' }]}>
                <Mail size={17} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.btnOutlineTitle, { color: theme.text }]}>Email</Text>
                <Text style={[styles.btnOutlineSub, { color: theme.textMuted }]}>{UPGRADE_EMAIL}</Text>
              </View>
            </TouchableOpacity>

          </View>
        </ScrollView>
      )}
    </View>
  );
}

// â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = StyleSheet.create({
  guideContainer: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header — glassmorphism
  headerGradient: { overflow: 'hidden' },
  headerBlur: { overflow: 'hidden' },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  headerFade: { height: 4 },

  // Hero card
  heroCard: { borderRadius: 20, padding: 22, marginBottom: 16 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
  },
  heroBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: 'Lexend_700Bold' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { fontSize: 24, fontWeight: '700', marginBottom: 5, fontFamily: 'Lexend_700Bold' },
  heroSub: { fontSize: 13, lineHeight: 19, fontFamily: 'Lexend_400Regular' },
  progressWrap: { marginTop: 18 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
  progressText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'Lexend_400Regular' },
  expiryChip: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  expiryChipText: { color: '#fff', fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // Referral
  referralCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  referralTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  referralSub: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // Sections
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12, fontFamily: 'Lexend_700Bold' },

  // Features table
  tableCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeadCell: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
  },
  tableHeadLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2, fontFamily: 'Lexend_700Bold' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  rowLabel: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabelText: { fontSize: 13, flex: 1, fontFamily: 'Lexend_400Regular' },
  rowCell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  cellVal: { fontSize: 11, fontWeight: '600', textAlign: 'center', fontFamily: 'Lexend_600SemiBold' },

  // Action buttons
  btnPrimary: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  btnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15, fontFamily: 'Lexend_700Bold' },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  btnIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnOutlineTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  btnOutlineSub: { fontSize: 12, marginTop: 1, fontFamily: 'Lexend_400Regular' },
  // Legacy aliases (keep for compatibility if referenced elsewhere)
  planHeaderRow: {},
  planHeaderCell: {},
  planHeaderCellPremium: {},
  planHeaderLabel: {},
  planHeaderSub: {},
});
