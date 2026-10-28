import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import {
  Activity,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Clock,
} from 'lucide-react-native';
import { JitBell, JitDeals, JitGames, JitPremium, JitStamp, JitStore } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { safeImpact } from '@/utils/haptics';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { usePersistedFlag } from '@/hooks/usePersistedFlag';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { ActionButton } from '@/components/ui/ActionButton';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListSkeleton } from '@/components/Skeleton';
import { useTransactions, useAdminNotifUnreadCount, useHomeStats } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { LinearGradient } from 'expo-linear-gradient';
import MerchantLogo from '@/components/MerchantLogo';
import PremiumLockModal from '@/components/PremiumLockModal';
import TipsCarousel from '@/components/TipsCarousel';
import QuickActionsRow, { type QuickAction } from '@/components/QuickActionsRow';
import MonthOverviewCard from '@/components/MonthOverviewCard';
import RecentActivityCard from '@/components/RecentActivityCard';
import KpiCounter from '@/components/KpiCounter';
import { useTourTarget } from '@/components/GuidedTour';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusFade } from '@/hooks/useFocusFade';
import WelcomeGuideCard from '@/components/WelcomeGuideCard';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import { ms, radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import type { Transaction } from '@/types';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
// Reserve space below the fixed header.
const TOP_BAR_HEIGHT = 62;
// Stable empty reference so MonthOverviewCard doesn't re-render before stats load.
const EMPTY_DAILY: number[] = [];
// Two violet tones only: the charcoal stop used elsewhere muddies the hero.
const HERO_GRADIENT = [palette.violetDeep, palette.violet] as const;
const ProUpgradeBanner = React.memo(function ProUpgradeBanner({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <NoticeBanner
      Icon={JitPremium}
      title={t('home.proTeaserTitle')}
      description={t('home.proTeaserDesc')}
      actionLabel={t('home.proTeaserCta')}
      onPress={onPress}
    />
  );
});

const TrialEndBanner = React.memo(function TrialEndBanner({
  daysRemaining, onPress, onDismiss,
}: { daysRemaining: number; onPress: () => void; onDismiss: () => void }) {
  const { t } = useLanguage();
  const urgent = daysRemaining <= 1;
  const title = urgent
    ? t('home.trialEndTomorrowTitle')
    : t('home.trialEndTitle', { days: daysRemaining });
  const desc = urgent ? t('home.trialEndUrgentDesc') : t('home.trialEndDesc');
  return (
    <NoticeBanner
      Icon={Clock}
      title={title}
      description={desc}
      actionLabel={t('home.trialEndCta')}
      onPress={onPress}
      onDismiss={onDismiss}
    />
  );
});

export default function HomeScreen() {
  const merchant = useAuthStore((s) => s.merchant);
  const { isPremium, isFreePlan, isTrial, daysRemaining } = usePlanStatus(merchant);
  const activeOnboardingSurface = useOnboardingStore((s) => s.active);
  const theme = useTheme();
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const dir = useDir();
  const { focusStyle } = useFocusFade();
  const insets = useSafeAreaInsets();
  const { data: unreadData } = useAdminNotifUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  // Android: "press back again to exit" on the home tab
  useExitOnBack();

  // Premium gate for the dashboard shortcut, mirrors the Compte screen.
  const [premiumModal, setPremiumModal] = useState<{ visible: boolean; titleKey: string; descKey: string }>({
    visible: false,
    titleKey: '',
    descKey: '',
  });
  const closePremiumModal = useCallback(() => setPremiumModal((prev) => ({ ...prev, visible: false })), []);

  const {
    data,
    isLoading: loading,
    isRefetching: refreshing,
    isError,
    refetch,
  } = useTransactions();

  const transactions = useMemo<Transaction[]>(
    () => (data?.pages ?? []).flatMap((p) => p.transactions),
    [data],
  );

  // Aggregated KPI + month scans are computed server-side over ALL rows (not
  // just the first transactions page), so today's total, the "vs hier" delta and
  // the month chart stay correct for high-volume merchants. Live via WS events.
  const { data: homeStats, isLoading: statsLoading, refetch: refetchStats } = useHomeStats();
  const { kpiValue, deltaPct, deltaSign, deltaPositive, clientsToday } = useMemo(() => {
    const today = homeStats?.today.stamps ?? 0;
    const yesterday = homeStats?.yesterday.stamps ?? 0;
    const rawDelta = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : today > 0 ? 100 : 0;
    return {
      kpiValue: today,
      deltaPct: Math.abs(rawDelta),
      deltaSign: rawDelta >= 0 ? '+' : '−',
      deltaPositive: rawDelta >= 0,
      clientsToday: homeStats?.today.clients ?? 0,
    };
  }, [homeStats]);

  const monthDaily = homeStats?.month.daily ?? EMPTY_DAILY;

  const recentTransactions = useMemo<Transaction[]>(() => transactions.slice(0, 5), [transactions]);

  const onRefresh = useGuardedCallback(async () => {
    await Promise.all([refetch(), refetchStats()]);
  }, [refetch, refetchStats]);

  const avatarTourRef = useTourTarget('avatar');
  const statsTourRef = useTourTarget('dashboard');
  const goToAccount = useCallback(() => router.push('/account'), [router]);
  const goToDashboard = useCallback(() => {
    // Same premium gating as Compte → Mon commerce → Dashboard
    if (!isPremium) {
      setPremiumModal({ visible: true, titleKey: 'account.dashboardLockedTitle', descKey: 'account.dashboardLockedMsg' });
      return;
    }
    router.push('/dashboard');
  }, [isPremium, router]);
  const goToNotifications = useCallback(() => router.push('/admin-notifications'), [router]);
  const goToPlan = useCallback(() => router.push('/plan'), [router]);
  const goToTransactions = useCallback(() => router.push('/transactions'), [router]);

  const quickActions = useMemo<QuickAction[]>(
    () => [
      { key: 'stores', label: t('home.qaStore'), Icon: JitStore, route: '/stores', tourKey: 'stores' },
      { key: 'loyalty', label: t('home.qaLoyalty'), Icon: JitStamp, route: '/settings', tourKey: 'loyalty' },
      { key: 'games', label: t('home.qaGames'), Icon: JitGames, route: '/games', tourKey: 'games' },
      { key: 'deals', label: t('home.qaDeals'), Icon: JitDeals, route: '/deals', tourKey: 'deals' },
    ],
    [t],
  );

  const trialDaysLeft = isTrial ? daysRemaining : null;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { value: trialBannerDismissed, setValue: setTrialBannerDismissed } = usePersistedFlag(ASYNC_STORAGE_KEYS.TRIAL_END_BANNER_DISMISSED_DAY, todayKey);
  const dismissTrialBanner = useCallback(() => {
    setTrialBannerDismissed(true);
  }, [setTrialBannerDismissed]);
  const showTrialBanner =
    trialDaysLeft != null && trialDaysLeft >= 1 && trialDaysLeft <= 7 && trialBannerDismissed === false;

  const initials = useMemo(() => {
    const parts = (merchant?.nom ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((w) => w.charAt(0)).join('').toUpperCase() || '?';
  }, [merchant?.nom]);

  const showSkeleton = loading && transactions.length === 0;

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 116 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
            progressViewOffset={insets.top + TOP_BAR_HEIGHT}
          />
        }
      >
        <LinearGradient
          colors={HERO_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + TOP_BAR_HEIGHT + 8 }]}
        >
          <View style={styles.heroGlow} pointerEvents="none" />

          {/* Today's KPI + month chart open the statistics (premium-gated). */}
          <TouchableOpacity
            onPress={goToDashboard}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('home.viewStats')}
          >
            <View ref={statsTourRef} collapsable={false}>
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabel} maxFontSizeMultiplier={1.3}>
                  {t('home.kpiStamps')}
                </Text>
                <KpiCounter value={kpiValue} ready={!statsLoading} style={styles.kpiValue} />
                <View style={styles.deltaPill}>
                  {deltaPositive ? (
                    <TrendingUp size={12} color="#fff" strokeWidth={icon.strokeSmall} />
                  ) : (
                    <TrendingDown size={12} color="#fff" strokeWidth={icon.strokeSmall} />
                  )}
                  <Text style={styles.deltaText} maxFontSizeMultiplier={1.3}>
                    {t('home.vsYesterday', { sign: deltaSign, percent: deltaPct })}
                  </Text>
                </View>
                <Text style={styles.kpiSub} maxFontSizeMultiplier={1.3}>
                  {t(clientsToday === 1 ? 'home.clientsScanned_one' : 'home.clientsScanned_other', { count: clientsToday })}
                </Text>
              </View>

              <MonthOverviewCard daily={monthDaily} locked={!isPremium} />
            </View>
          </TouchableOpacity>

          <QuickActionsRow items={quickActions} />
        </LinearGradient>

        <View style={styles.content}>
          {!activeOnboardingSurface && <TipsCarousel />}

          {!activeOnboardingSurface && showTrialBanner && trialDaysLeft != null && (
            <View style={{ paddingTop: 12 }}>
              <TrialEndBanner
                daysRemaining={trialDaysLeft}
                onPress={goToPlan}
                onDismiss={dismissTrialBanner}
              />
            </View>
          )}

          {!activeOnboardingSurface && isFreePlan && (
            <View style={{ paddingTop: 12 }}>
              <ProUpgradeBanner onPress={goToPlan} />
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
            {t('home.recentActivity')}
          </Text>

          {isError && transactions.length === 0 && !loading ? (
            <View style={styles.emptyInline}>
              <View style={[styles.emptyIcon, { backgroundColor: `${theme.danger}14` }]}>
                <AlertCircle size={32} color={theme.danger} strokeWidth={icon.stroke} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
                {t('common.errorTitle')}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                {t('common.errorHint')}
              </Text>
              <ActionButton
                label={t('common.retry')}
                style={styles.retryBtn}
                onPress={() => {
                  safeImpact(Haptics.ImpactFeedbackStyle.Light);
                  refetch();
                }}
              />
            </View>
          ) : showSkeleton ? (
            <ListSkeleton count={5} />
          ) : recentTransactions.length > 0 ? (
            <RecentActivityCard
              transactions={recentTransactions}
              onViewAll={goToTransactions}
            />
          ) : (
            <View style={styles.emptyInline}>
              <View style={[styles.emptyIcon, styles.emptyIconNeutral]}>
                <Activity size={32} color={palette.charbon} strokeWidth={icon.stroke} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
                {t('activity.noActivity')}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                {t('activity.noActivityHint')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <WelcomeGuideCard />

      <View style={[styles.floatingTopBar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.profile}
            onPress={goToAccount}
            activeOpacity={0.8}
            hitSlop={HIT_SLOP_LARGE}
            accessibilityRole="button"
            accessibilityLabel={t('home.openAccount')}
            accessibilityValue={unreadCount > 0 ? { text: String(unreadCount) } : undefined}
          >
            <View ref={avatarTourRef} collapsable={false} style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {merchant?.logoUrl ? (
                  <MerchantLogo logoUrl={merchant.logoUrl} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitials} maxFontSizeMultiplier={1.2}>{initials}</Text>
                )}
              </View>
              {unreadCount > 0 && (
                <View
                  style={[styles.avatarBadge, isRTL ? { left: -4 } : { right: -4 }]}
                  importantForAccessibility="no"
                >
                  <Text style={styles.avatarBadgeText} maxFontSizeMultiplier={1.2}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.greeting} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              <Text style={styles.greetingHi}>{t('home.greeting')} </Text>
              <Text style={styles.greetingShop}>{merchant?.nom ?? ''}</Text>
            </Text>
            <ChevronRight size={16} color={palette.heroMuted} strokeWidth={icon.strokeSmall} style={dir.flip} />
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={goToNotifications}
              activeOpacity={0.8}
              hitSlop={HIT_SLOP_LARGE}
              accessibilityRole="button"
              accessibilityLabel={t('home.openNotifications')}
            >
              <JitBell size={18} color="#fff" strokeWidth={icon.stroke} />
              {unreadCount > 0 && (
                <View
                  style={[
                    styles.iconBtnDot,
                    isRTL ? { left: -3 } : { right: -3 },
                    { borderColor: palette.violetDeep },
                  ]}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <PremiumLockModal
        visible={premiumModal.visible}
        onClose={closePremiumModal}
        titleKey={premiumModal.titleKey}
        descKey={premiumModal.descKey}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  content: { paddingHorizontal: 16, paddingTop: 14 },
  emptyInline: { alignItems: 'center', paddingTop: 48 },

  hero: {
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: radius['2xl'],
    borderBottomRightRadius: radius['2xl'],
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  floatingTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 30,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  // Glass pill so the account entry reads as a tappable control on the hero.
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.violetLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.violetDeep,
  },
  avatarBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: font.bold,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    fontSize: 15,
    color: '#fff',
    fontFamily: font.bold,
  },
  greeting: { flexShrink: 1, fontSize: 15 },
  greetingHi: {
    color: palette.heroMuted,
    fontFamily: font.medium,
  },
  greetingShop: {
    color: '#fff',
    fontFamily: font.semibold,
    letterSpacing: -0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDot: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
  },

  kpiBlock: {
    alignItems: 'center',
    paddingTop: 6,
  },
  kpiLabel: {
    fontSize: 11,
    color: palette.heroMuted,
    fontFamily: font.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  kpiValue: {
    marginTop: 4,
    fontSize: 46,
    color: '#fff',
    fontFamily: font.bold,
    letterSpacing: -1.5,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  deltaText: {
    fontSize: 12,
    color: '#fff',
    fontFamily: font.semibold,
  },
  kpiSub: {
    marginTop: 8,
    fontSize: 12,
    color: palette.heroMuted,
    fontFamily: font.medium,
  },

  sectionTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    letterSpacing: -0.3,
    marginTop: 16,
    marginBottom: 10,
  },

  emptyIcon: { width: ms(88), height: ms(88), borderRadius: ms(24), alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyIconNeutral: { backgroundColor: `${palette.charbon}12` },
  emptyTitle: {
    fontSize: 20,
    fontFamily: font.bold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 48,
    lineHeight: 22,
    fontFamily: font.regular,
  },

  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
  },
});

