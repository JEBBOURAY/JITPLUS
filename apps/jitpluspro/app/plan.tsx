import React, { useMemo, useCallback } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  MessageSquare,
  Mail,
  MessageCircle,
  Repeat,
  UserCheck,
  AlertCircle,
} from 'lucide-react-native';
import {
  JitBell,
  JitClients,
  JitGames,
  JitGift,
  JitPremium,
  JitScan,
  JitStats,
  JitStore,
} from '@/components/icons';
import { hapticLight, hapticSuccess } from '@/utils/haptics';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlan, useReferral, useApplyReferralMonths } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { ActionButton } from '@/components/ui/ActionButton';
import { ProBadge } from '@/components/ui/ProBadge';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

const UPGRADE_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || (__DEV__ ? '212600000000' : '');
const UPGRADE_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'contact@jitplus.com';

// Apple Guideline 3.1.1 / 3.1.3: on iOS we must not advertise or link to
// external purchase mechanisms (WhatsApp / email upgrade flows). The
// comparison table remains visible as purely informational content.
const IS_IOS = Platform.OS === 'ios';
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const WHATSAPP_GREEN = '#25D366';

interface FeatureRow {
  icon: React.ReactNode;
  label: string;
  free: string | boolean;
  premium: string | boolean;
}

export default function PlanScreen() {
  const theme = useTheme();
  const dir = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const { merchant, isTeamMember } = useAuth();

  const { data: planInfo, isLoading: loading, isRefetching, refetch, error: planError } = usePlan();
  const { data: referral } = useReferral(!isTeamMember);
  const { mutateAsync: applyReferralMonths, isPending: applyingMonths } = useApplyReferralMonths();

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
            try {
              await applyReferralMonths();
              hapticSuccess();
              Alert.alert(t('account.planReferralSuccess'), t('account.planReferralSuccessMsg'));
            } catch (e) {
              Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
            }
          },
        },
      ],
    );
  }, [referral, t, applyReferralMonths]);

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

  const { isPremium, isTrial, isAdminPremium: isAdminActivated, trialProgress: elapsedProgress, trialTotalDays } = usePlanStatus(planInfo);
  const trialProgress = elapsedProgress === null ? 0 : 1 - elapsedProgress;

  const planExpiresAt = planInfo?.planExpiresAt;
  const expiryDateLabel = useMemo(() => {
    if (!planExpiresAt) return '—';
    const d = new Date(planExpiresAt);
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
  }, [planExpiresAt, locale]);

  const planBadgeLabel = isTrial
    ? t('account.planTrial')
    : isPremium
    ? t('account.planTablePro')
    : t('account.planTableFree');

  const referralMonths = referral?.referralMonthsEarned ?? 0;
  const referralTitle = t(
    referralMonths === 1 ? 'account.planReferralTitle_one' : 'account.planReferralTitle_other',
    { count: referralMonths },
  );

  const describeCell = (value: string | boolean) =>
    typeof value === 'boolean' ? (value ? t('common.included') : t('common.notIncluded')) : value;

  const goBack = useCallback(() => {
    hapticLight();
    router.back();
  }, [router]);

  const features: FeatureRow[] = useMemo(
    () => [
      {
        icon: <Repeat size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureLoyalty'),
        free: true,
        premium: true,
      },
      {
        icon: <JitStore size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureStores'),
        free: t('account.planFeatureStoresFree'),
        premium: t('account.planFeatureStoresPremium'),
      },
      {
        icon: <JitClients size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureClients'),
        free: t('account.planFeatureClientsFree'),
        premium: t('account.planFeatureClientsPremium'),
      },
      {
        icon: <JitScan size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureQr'),
        free: true,
        premium: true,
      },
      {
        icon: <JitStats size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureDashboard'),
        free: false,
        premium: true,
      },
      {
        icon: <JitBell size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeaturePush'),
        free: true,
        premium: t('account.planFeaturePushPremium'),
      },
      {
        icon: <MessageSquare size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureMessages'),
        free: false,
        premium: t('account.planFeatureMessagesPremium'),
      },
      {
        icon: <UserCheck size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureTeam'),
        free: false,
        premium: true,
      },
      {
        icon: <JitGift size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureGifts'),
        free: t('account.planFeatureGiftsFree'),
        premium: t('account.planFeatureGiftsPremium'),
      },
      {
        icon: <JitStats size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureLoyaltySettings'),
        free: false,
        premium: true,
      },
      {
        icon: <JitGames size={16} color={theme.primary} strokeWidth={icon.stroke} />,
        label: t('account.planFeatureLuckyWheel'),
        free: false,
        premium: true,
      },
    ],
    [t, theme.primary],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { flexDirection: dir.row, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backBtn}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            strokeWidth={icon.stroke}
            style={dir.flip}
          />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text, textAlign: dir.textAlign }]}
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
          <AlertCircle size={48} color={theme.textMuted} strokeWidth={icon.stroke} />
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
          <ActionButton
            label={t('common.retry')}
            onPress={onRefresh}
            style={styles.retryBtn}
          />
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
          <View
            style={[
              styles.guideContainer,
              dir.isRTL
                ? { borderRightWidth: 3, borderRightColor: theme.primary }
                : { borderLeftWidth: 3, borderLeftColor: theme.primary },
              { backgroundColor: theme.primaryBg || (theme.primary + '10') },
            ]}
          >
            <Text
              style={[styles.guideText, { color: theme.textSecondary, textAlign: dir.textAlign }]}
              maxFontSizeMultiplier={1.4}
            >
              {IS_IOS ? t('account.planGuideTextIOS') : t('account.planGuideText')}
            </Text>
          </View>
          <LinearGradient
            colors={isPremium ? ['#4C1D95', '#7C3AED', '#1F2937'] : [theme.bgCard, theme.bgCard]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { borderColor: isPremium ? 'transparent' : theme.border }]}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={planBadgeLabel}
          >
            <View
              style={[
                styles.heroBadge,
                { flexDirection: dir.row, alignSelf: dir.alignStart },
                { backgroundColor: isPremium ? 'rgba(255,255,255,0.15)' : theme.border + '55' },
              ]}
            >
              {isTrial
                ? <Clock size={12} color={isPremium ? palette.gold : theme.textMuted} strokeWidth={icon.strokeSmall} />
                : <JitPremium size={12} color={isPremium ? palette.gold : theme.textMuted} strokeWidth={icon.strokeSmall} />}
              <Text
                style={[styles.heroBadgeText, { color: isPremium ? palette.gold : theme.textMuted }]}
                maxFontSizeMultiplier={1.3}
              >
                {planBadgeLabel}
              </Text>
            </View>

            <View>
              <Text
                style={[styles.heroTitle, { color: isPremium ? '#fff' : theme.text, textAlign: dir.textAlign }]}
                maxFontSizeMultiplier={1.4}
              >
                {isAdminActivated
                  ? t('account.planHeroTitlePro')
                  : isTrial
                  ? t('account.planHeroTitleTrial')
                  : t('account.planHeroTitleFree')}
              </Text>
              <Text
                style={[styles.heroSub, { color: isPremium ? 'rgba(255,255,255,0.72)' : theme.textMuted, textAlign: dir.textAlign }]}
                maxFontSizeMultiplier={1.4}
              >
                {(isAdminActivated && !planExpiresAt)
                  ? t('account.planHeroSubUnlimited')
                  : (isAdminActivated && planExpiresAt)
                  ? t('account.planHeroSubValidUntil', { date: expiryDateLabel })
                  : isTrial
                  ? t(planInfo?.daysRemaining === 1 ? 'account.planHeroSubTrialDays_one' : 'account.planHeroSubTrialDays_other', { count: planInfo?.daysRemaining ?? 0 })
                  : t('account.planHeroSubFree')}
              </Text>
            </View>

            {isTrial && planInfo?.daysRemaining != null && (
              <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { flexDirection: dir.row, backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <View style={[styles.progressFill, { width: `${Math.round(trialProgress * 100)}%` as `${number}%` }]} />
                </View>
                <View style={[styles.progressLabels, { flexDirection: dir.row }]}>
                  <Text style={styles.progressText} maxFontSizeMultiplier={1.3}>{t('account.planTrialLabel')}</Text>
                  <Text style={styles.progressText} maxFontSizeMultiplier={1.3}>{t('account.planTrialProgress', { remaining: planInfo.daysRemaining, total: trialTotalDays })}</Text>
                </View>
              </View>
            )}

            {!!isAdminActivated && !!planExpiresAt && planInfo?.daysRemaining != null && (
              <View style={[styles.expiryChip, { alignSelf: dir.alignStart }]}>
                <Text style={styles.expiryChipText} maxFontSizeMultiplier={1.3}>{t('account.planExpiryDaysChip', { count: planInfo.daysRemaining })}</Text>
              </View>
            )}
          </LinearGradient>

          {!isPremium && referralMonths > 0 && (
            <TouchableOpacity
              style={[
                styles.referralCard,
                { flexDirection: dir.row, backgroundColor: palette.cyan + '15', borderColor: palette.cyan },
                applyingMonths && { opacity: 0.6 },
              ]}
              onPress={handleApplyReferralMonths}
              disabled={applyingMonths}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: applyingMonths, busy: applyingMonths }}
              accessibilityLabel={referralTitle}
              accessibilityHint={t('account.planReferralSub')}
            >
              {applyingMonths ? (
                <ActivityIndicator size="small" color={palette.cyan} />
              ) : (
                <>
                  <View style={[styles.btnIcon, { backgroundColor: palette.cyan + '22' }]}>
                    <JitGift size={20} color={palette.cyan} strokeWidth={icon.stroke} />
                  </View>
                  <View style={styles.flex1}>
                    <Text
                      style={[styles.referralTitle, { color: palette.cyan, textAlign: dir.textAlign }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {referralTitle}
                    </Text>
                    <Text
                      style={[styles.referralSub, { color: theme.textMuted, textAlign: dir.textAlign }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {t('account.planReferralSub')}
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]}
              maxFontSizeMultiplier={1.3}
              accessibilityRole="header"
            >
              {t('account.planFeaturesTitle')}
            </Text>
            <View style={[styles.tableCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <View style={[styles.tableHead, { flexDirection: dir.row, borderBottomColor: theme.border }]}>
                <View style={styles.flex2} />
                <View style={styles.tableHeadCell}>
                  <Text
                    style={[styles.tableHeadLabel, { color: theme.textMuted }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.planTableFree')}
                  </Text>
                </View>
                <View style={[styles.tableHeadCell, styles.tableHeadCellPro, { backgroundColor: '#37415115' }]}>
                  <ProBadge variant="primary" style={styles.tableHeadBadge} />
                </View>
              </View>
              {features.map((f, i) => (
                <View
                  key={i}
                  style={[
                    styles.tableRow,
                    { flexDirection: dir.row },
                    i < features.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                  ]}
                  accessible
                  accessibilityLabel={`${f.label}. ${t('account.planTableFree')}: ${describeCell(f.free)}. ${t('account.planTablePro')}: ${describeCell(f.premium)}.`}
                >
                  <View style={[styles.rowLabel, { flexDirection: dir.row }]}>
                    {f.icon}
                    <Text
                      style={[styles.rowLabelText, { color: theme.textSecondary, textAlign: dir.textAlign }]}
                      numberOfLines={2}
                      maxFontSizeMultiplier={1.3}
                    >
                      {f.label}
                    </Text>
                  </View>
                  <View style={styles.rowCell}>
                    {typeof f.free === 'boolean'
                      ? f.free ? <Check size={16} color={palette.violet} strokeWidth={icon.stroke} /> : <X size={15} color={theme.textMuted + '66'} strokeWidth={icon.stroke} />
                      : <Text style={[styles.cellVal, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{f.free}</Text>}
                  </View>
                  <View style={[styles.rowCell, { backgroundColor: '#37415110' }]}>
                    {typeof f.premium === 'boolean'
                      ? f.premium ? <Check size={16} color={palette.violet} strokeWidth={icon.stroke} /> : <X size={15} color={theme.textMuted + '66'} strokeWidth={icon.stroke} />
                      : <Text style={[styles.cellVal, styles.cellValPro, { color: palette.violet }]} maxFontSizeMultiplier={1.3}>{f.premium}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Hidden on iOS for Apple 3.1.1 / 3.1.3 compliance. */}
          {!IS_IOS && (
            <View style={styles.section}>
              <Text
                style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]}
                maxFontSizeMultiplier={1.3}
                accessibilityRole="header"
              >
                {t('account.planSectionSupport')}
              </Text>

              <TouchableOpacity
                style={[styles.btnOutline, { flexDirection: dir.row, backgroundColor: WHATSAPP_GREEN + '10', borderColor: WHATSAPP_GREEN + '50' }]}
                onPress={handleContactWhatsApp}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t('account.planWhatsapp')}
                accessibilityHint={t('account.planWhatsappSub')}
              >
                <View style={[styles.btnIcon, { backgroundColor: WHATSAPP_GREEN + '22' }]}>
                  <MessageCircle size={17} color={WHATSAPP_GREEN} strokeWidth={icon.stroke} />
                </View>
                <View style={styles.flex1}>
                  <Text
                    style={[styles.btnOutlineTitle, { color: theme.text, textAlign: dir.textAlign }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.planWhatsapp')}
                  </Text>
                  <Text
                    style={[styles.btnOutlineSub, { color: theme.textMuted, textAlign: dir.textAlign }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.planWhatsappSub')}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnOutline, { flexDirection: dir.row, backgroundColor: theme.bgCard, borderColor: theme.border }]}
                onPress={handleContactEmail}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t('account.contactViaEmail')}
                accessibilityHint={UPGRADE_EMAIL}
              >
                <View style={[styles.btnIcon, { backgroundColor: theme.primary + '18' }]}>
                  <Mail size={17} color={theme.primary} strokeWidth={icon.stroke} />
                </View>
                <View style={styles.flex1}>
                  <Text
                    style={[styles.btnOutlineTitle, { color: theme.text, textAlign: dir.textAlign }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('account.contactViaEmail')}
                  </Text>
                  <Text
                    style={[styles.btnOutlineSub, { color: theme.textMuted, textAlign: dir.textAlign }]}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  errorTitle: { fontSize: 18, fontFamily: font.bold, marginTop: 4, textAlign: 'center' },
  errorText: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: font.regular },
  retryBtn: { marginTop: 8, paddingHorizontal: 24 },

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
    fontFamily: font.bold,
    letterSpacing: -0.5,
  },

  guideContainer: {
    marginHorizontal: 4,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: font.regular,
  },

  heroCard: { borderRadius: 16, borderWidth: 1, padding: 22, marginBottom: 16, marginHorizontal: 4 },
  heroBadge: {
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 16,
  },
  heroBadgeText: { fontSize: 12, fontFamily: font.semibold },
  heroTitle: { fontSize: 24, marginBottom: 5, fontFamily: font.bold },
  heroSub: { fontSize: 13, lineHeight: 19, fontFamily: font.regular },
  progressWrap: { marginTop: 18 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: '#fff' },
  progressLabels: { justifyContent: 'space-between', marginTop: 5 },
  progressText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: font.regular },
  expiryChip: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  expiryChipText: { color: '#fff', fontSize: 12, fontFamily: font.semibold },

  referralCard: {
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  referralTitle: { fontSize: 14, fontFamily: font.semibold },
  referralSub: { fontSize: 12, marginTop: 2, fontFamily: font.regular },

  section: { marginBottom: 20, marginHorizontal: 4 },
  sectionTitle: { fontSize: 15, marginBottom: 12, fontFamily: font.semibold },

  tableCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  tableHead: {
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
  tableHeadCellPro: { borderRadius: 8, paddingHorizontal: 4 },
  tableHeadBadge: { alignSelf: 'center', backgroundColor: 'transparent' },
  tableHeadLabel: { fontSize: 12, fontFamily: font.semibold },
  tableRow: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  rowLabel: { flex: 2, alignItems: 'center', gap: 8 },
  rowLabelText: { fontSize: 13, flex: 1, fontFamily: font.regular },
  rowCell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  cellVal: { fontSize: 11, textAlign: 'center', fontFamily: font.semibold },
  cellValPro: { fontFamily: font.bold },

  btnOutline: {
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  btnIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnOutlineTitle: { fontSize: 14, fontFamily: font.semibold },
  btnOutlineSub: { fontSize: 12, marginTop: 1, fontFamily: font.regular },
});
