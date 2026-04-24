import React, { useState, useMemo, useCallback } from 'react';
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
  RefreshControl,
  I18nManager,
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
  AlertCircle,
  Dices,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlan, useReferral, useApplyReferralMonths } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';

// ── Contact info for support ────────────────────────────────────────────────
const UPGRADE_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || (__DEV__ ? '212600000000' : '');
const UPGRADE_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'contact@jitplus.com';

// ── Platform gate ───────────────────────────────────────────────────────────
// Apple Guideline 3.1.1 / 3.1.3: on iOS we must not advertise or link to
// external purchase mechanisms (WhatsApp / email upgrade flows). The
// comparison table remains visible as purely informational content.
const IS_IOS = Platform.OS === 'ios';
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const TRIAL_DURATION_DAYS = 30;

const hapticLight = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
};
const hapticSuccess = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
};

interface FeatureRow {
  icon: React.ReactNode;
  label: string;
  free: string | boolean;
  premium: string | boolean;
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function PlanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const { merchant, isTeamMember } = useAuth();

  const { data: planInfo, isLoading: loading, isRefetching, refetch, error: planError } = usePlan();
  const { data: referral } = useReferral(!isTeamMember);
  const applyReferralMutation = useApplyReferralMonths();
  const [applyingMonths, setApplyingMonths] = useState(false);

  const onRefresh = useCallback(async () => {
    hapticLight();
    try {
      await refetch();
    } catch {
      /* handled by error state */
    }
  }, [refetch]);

  const handleApplyReferralMonths = useCallback(() => {
    if (!referral || referral.referralMonthsEarned <= 0) return;
    hapticLight();
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
              hapticSuccess();
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
  }, [referral, t, applyReferralMutation]);

  const handleContactWhatsApp = useCallback(async () => {
    hapticLight();
    if (!UPGRADE_WHATSAPP) {
      Alert.alert(t('common.error'), t('account.planErrorWhatsapp'));
      return;
    }
    const msg = encodeURIComponent(
      t('account.planContactWhatsappMsg', { name: merchant?.nom ?? '', email: merchant?.email ?? '' }),
    );
    const url = `https://wa.me/${UPGRADE_WHATSAPP}?text=${msg}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('account.planErrorWhatsapp'));
    }
  }, [merchant?.nom, merchant?.email, t]);

  const handleContactEmail = useCallback(async () => {
    hapticLight();
    const subject = encodeURIComponent(t('account.planContactEmailSubject'));
    const body = encodeURIComponent(
      t('account.planContactEmailBody', { name: merchant?.nom ?? '', email: merchant?.email ?? '' }),
    );
    const url = `mailto:${UPGRADE_EMAIL}?subject=${subject}&body=${body}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('account.planErrorEmail'));
    }
  }, [merchant?.nom, merchant?.email, t]);

  // ── Derived ────────────────────────────────────────────────
  const isPremium = planInfo?.plan === 'PREMIUM';
  const isTrial = isPremium && planInfo?.isTrial;
  const isAdminActivated = isPremium && planInfo?.planActivatedByAdmin;
  const trialProgress =
    isTrial && planInfo?.daysRemaining != null
      ? Math.max(0, Math.min(1, planInfo.daysRemaining / TRIAL_DURATION_DAYS))
      : 0;

  // Memoized expiry date formatter (avoids re-creating Date + formatter on every render)
  const expiryDateLabel = useMemo(() => {
    if (!planInfo?.planExpiresAt) return '—';
    const d = new Date(planInfo.planExpiresAt);
    if (isNaN(d.getTime())) return '—';
    try {
      return d.toLocaleDateString(locale === 'ar' ? 'ar-MA' : locale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }, [planInfo?.planExpiresAt, locale]);

  const features: FeatureRow[] = useMemo(
    () => [
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
      {
        icon: <Dices size={16} color={theme.primary} />,
        label: t('account.planFeatureLuckyWheel'),
        free: false,
        premium: true,
      },
    ],
    [t, theme.primary],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Simple header — matches security / team-management style ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={styles.backBtn}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          accessibilityRole="header"
        >
          {t('account.planPageTitle')}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : planError && !planInfo ? (
        <View style={styles.loading}>
          <AlertCircle size={48} color={theme.textMuted} strokeWidth={1.5} />
          <Text
            style={[styles.errorTitle, { color: theme.text }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('common.error')}
          </Text>
          <Text
            style={[styles.errorText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            {getErrorMessage(planError, t('common.genericError'))}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.retryBtnText} maxFontSizeMultiplier={1.3}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 50 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          {/* -- Guide text -- */}
          <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
            <Text
              style={[styles.guideText, { color: theme.textSecondary }]}
              maxFontSizeMultiplier={1.4}
            >
              {IS_IOS ? t('account.planGuideTextIOS') : t('account.planGuideText')}
            </Text>
          </View>
          {/* ── Hero plan card ── */}
          <LinearGradient
            colors={isPremium ? ['#4C1D95', '#7C3AED', '#1F2937'] : [theme.bgCard, theme.bgCard]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, !isPremium && { borderColor: theme.border, borderWidth: 1 }]}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={
              isTrial
                ? t('account.planBadgeTrial')
                : isPremium
                ? t('account.planBadgePro')
                : t('account.planBadgeFree')
            }
          >
            <View style={[styles.heroBadge, { backgroundColor: isPremium ? 'rgba(255,255,255,0.15)' : theme.border + '55' }]}>
              {isTrial
                ? <Zap size={12} color={isPremium ? '#FCD34D' : theme.textMuted} strokeWidth={1.5} />
                : <Crown size={12} color={isPremium ? '#FCD34D' : theme.textMuted} strokeWidth={1.5} />}
              <Text
                style={[styles.heroBadgeText, { color: isPremium ? '#FCD34D' : theme.textMuted }]}
                maxFontSizeMultiplier={1.3}
              >
                {isTrial ? t('account.planBadgeTrial') : isPremium ? t('account.planBadgePro') : t('account.planBadgeFree')}
              </Text>
            </View>

            <View style={styles.heroRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.heroTitle, { color: isPremium ? '#fff' : theme.text }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {isAdminActivated
                    ? t('account.planHeroTitlePro')
                    : isTrial
                    ? t('account.planHeroTitleTrial')
                    : t('account.planHeroTitleFree')}
                </Text>
                <Text
                  style={[styles.heroSub, { color: isPremium ? 'rgba(255,255,255,0.72)' : theme.textMuted }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {(isAdminActivated && !planInfo?.planExpiresAt)
                    ? t('account.planHeroSubUnlimited')
                    : (isAdminActivated && planInfo?.planExpiresAt)
                    ? t('account.planHeroSubValidUntil', { date: expiryDateLabel })
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
                  <Text style={styles.progressText} maxFontSizeMultiplier={1.3}>{t('account.planTrialLabel')}</Text>
                  <Text style={styles.progressText} maxFontSizeMultiplier={1.3}>{t('account.planTrialProgress', { remaining: planInfo.daysRemaining, total: TRIAL_DURATION_DAYS })}</Text>
                </View>
              </View>
            )}

            {/* Chip jours restants pour abonnement payé */}
            {!!isAdminActivated && !!planInfo?.planExpiresAt && planInfo?.daysRemaining != null && (
              <View style={styles.expiryChip}>
                <Text style={styles.expiryChipText} maxFontSizeMultiplier={1.3}>{t('account.planExpiryDaysChip', { count: planInfo.daysRemaining })}</Text>
              </View>
            )}
          </LinearGradient>

          {/* ── Parrainage CTA ── */}
          {!isPremium && referral && referral.referralMonthsEarned > 0 && (
            <TouchableOpacity
              style={[
                styles.referralCard,
                { backgroundColor: palette.cyan + '15', borderColor: palette.cyan },
                applyingMonths && { opacity: 0.6 },
              ]}
              onPress={handleApplyReferralMonths}
              disabled={applyingMonths}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: applyingMonths, busy: applyingMonths }}
              accessibilityLabel={t('account.planReferralTitle', { count: referral.referralMonthsEarned })}
              accessibilityHint={t('account.planReferralSub')}
            >
              {applyingMonths ? (
                <ActivityIndicator size="small" color={palette.cyan} />
              ) : (
                <>
                  <Gift size={22} color={palette.cyan} />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.referralTitle, { color: palette.cyan }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {t('account.planReferralTitle', { count: referral.referralMonthsEarned })}
                    </Text>
                    <Text
                      style={[styles.referralSub, { color: theme.textMuted }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {t('account.planReferralSub')}
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── Comparaison des fonctionnalités ── */}
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: theme.text }]}
              maxFontSizeMultiplier={1.3}
              accessibilityRole="header"
            >
              {t('account.planFeaturesTitle')}
            </Text>
            <View style={[styles.tableCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <View style={[styles.tableHead, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 2 }} />
                <View style={styles.tableHeadCell}>
                  <Text
                    style={[styles.tableHeadLabel, { color: theme.textMuted }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.planTableFree')}
                  </Text>
                </View>
                <View style={[styles.tableHeadCell, { backgroundColor: '#37415115', borderRadius: 8, paddingHorizontal: 4 }]}>
                  <Crown size={11} color={palette.violet} />
                  <Text
                    style={[styles.tableHeadLabel, { color: palette.violet }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.planTablePro')}
                  </Text>
                </View>
              </View>
              {features.map((f, i) => (
                <View
                  key={i}
                  style={[
                    styles.tableRow,
                    i < features.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                  ]}
                  accessible
                  accessibilityLabel={`${f.label}. ${t('account.planTableFree')}: ${typeof f.free === 'boolean' ? (f.free ? '✓' : '✗') : f.free}. ${t('account.planTablePro')}: ${typeof f.premium === 'boolean' ? (f.premium ? '✓' : '✗') : f.premium}.`}
                >
                  <View style={styles.rowLabel}>
                    {f.icon}
                    <Text
                      style={[styles.rowLabelText, { color: theme.textSecondary }]}
                      numberOfLines={2}
                      maxFontSizeMultiplier={1.3}
                    >
                      {f.label}
                    </Text>
                  </View>
                  <View style={styles.rowCell}>
                    {typeof f.free === 'boolean'
                      ? f.free ? <Check size={16} color={palette.violet} /> : <X size={15} color={theme.textMuted + '66'} />
                      : <Text style={[styles.cellVal, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{f.free}</Text>}
                  </View>
                  <View style={[styles.rowCell, { backgroundColor: '#37415110' }]}>
                    {typeof f.premium === 'boolean'
                      ? f.premium ? <Check size={16} color={palette.violet} /> : <X size={15} color={theme.textMuted + '66'} />
                      : <Text style={[styles.cellVal, { color: palette.violet, fontWeight: '700' }]} maxFontSizeMultiplier={1.3}>{f.premium}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* ── Support (hidden on iOS — Apple 3.1.1 / 3.1.3 compliance) ── */}
          {!IS_IOS && (
            <View style={styles.section}>
              <Text
                style={[styles.sectionTitle, { color: theme.text }]}
                maxFontSizeMultiplier={1.3}
                accessibilityRole="header"
              >
                {t('account.planSectionSupport')}
              </Text>

              {/* WhatsApp */}
              <TouchableOpacity
                style={[styles.btnOutline, { backgroundColor: '#25D36610', borderColor: '#25D36650' }]}
                onPress={handleContactWhatsApp}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t('account.planWhatsapp')}
                accessibilityHint={t('account.planWhatsappSub')}
              >
                <View style={[styles.btnIcon, { backgroundColor: '#25D36622' }]}>
                  <Phone size={17} color="#25D366" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.btnOutlineTitle, { color: theme.text }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.planWhatsapp')}
                  </Text>
                  <Text
                    style={[styles.btnOutlineSub, { color: theme.textMuted }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.planWhatsappSub')}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Email */}
              <TouchableOpacity
                style={[styles.btnOutline, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                onPress={handleContactEmail}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Email"
                accessibilityHint={UPGRADE_EMAIL}
              >
                <View style={[styles.btnIcon, { backgroundColor: theme.primary + '18' }]}>
                  <Mail size={17} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.btnOutlineTitle, { color: theme.text }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    Email
                  </Text>
                  <Text
                    style={[styles.btnOutlineSub, { color: theme.textMuted }]}
                    maxFontSizeMultiplier={1.3}
                    numberOfLines={1}
                  >
                    {UPGRADE_EMAIL}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  errorTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Lexend_700Bold', marginTop: 4, textAlign: 'center' },
  errorText: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // Header — simple bar (matches security / team-management style)
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 8,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },

  // Guide text
  guideContainer: {
    marginHorizontal: 4,
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

  // Hero card
  heroCard: { borderRadius: 20, padding: 22, marginBottom: 16, marginHorizontal: 4 },
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
    marginHorizontal: 4,
  },
  referralTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  referralSub: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // Sections
  section: { marginBottom: 20, marginHorizontal: 4 },
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

  // Support buttons
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
});
