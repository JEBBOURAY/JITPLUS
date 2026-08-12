import React, { useCallback, useMemo, useState, useEffect } from 'react';
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
  Zap,
  AlertCircle,
  BarChart3,
  Bell,
  TrendingUp,
  TrendingDown,
  Coins,
  Star,
  Stamp,
  Crown,
  ChevronRight,
  Eye,
  Store,
  CreditCard,
  Ticket,
  Users,
  Clock,
  X,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, palette, brandGradientFull } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActivityListSkeleton } from '@/components/Skeleton';
import { useTransactions, useAdminNotifUnreadCount, useHomeStats } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { LinearGradient } from 'expo-linear-gradient';
import MerchantLogo from '@/components/MerchantLogo';
import PremiumLockModal from '@/components/PremiumLockModal';
import { SetupChecklist } from '@/components/SetupChecklist';
import TipsCarousel from '@/components/TipsCarousel';
import QuickActionsRow, { type QuickAction } from '@/components/QuickActionsRow';
import MonthOverviewCard from '@/components/MonthOverviewCard';
import RecentActivityCard from '@/components/RecentActivityCard';
import KpiCounter from '@/components/KpiCounter';
import { useTourTarget } from '@/components/GuidedTour';
import { useSafeAreaInsets } from 'react-native-safe-area-context';import { useFocusFade } from '@/hooks/useFocusFade';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import { pokeInteraction } from '@/utils/interaction';
import { ms } from '@/utils/responsive';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import type { Transaction } from '@/types';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
// Height of the floating top-bar content (below the status bar). The hero
// gradient is padded by this amount so its content clears the floating icons.
const TOP_BAR_HEIGHT = 56;
// Stable empty reference so MonthOverviewCard doesn't re-render before stats load.
const EMPTY_DAILY: number[] = [];
const safeImpact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};

/* ── Discrete Free → Pro teaser (only shown on the Free plan) ── */
const ProUpgradeBanner = React.memo(function ProUpgradeBanner({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      style={proStyles.wrapper}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${t('home.proTeaserTitle')} · ${t('home.proTeaserCta')}`}
    >
      <LinearGradient
        colors={['#0f031e', '#1a0533']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={proStyles.gradient}
      >
        <View style={proStyles.iconWrap}>
          <Crown size={15} color={palette.gold} strokeWidth={2} />
        </View>
        <View style={proStyles.textWrap}>
          <Text style={proStyles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('home.proTeaserTitle')}
          </Text>
          <Text style={proStyles.desc} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('home.proTeaserDesc')}
          </Text>
        </View>
        <Text style={proStyles.cta} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {t('home.proTeaserCta')}
        </Text>
        <ChevronRight size={16} color={palette.gold} strokeWidth={2} />
      </LinearGradient>
    </TouchableOpacity>
  );
});

/* ── Premium trial-end reminder (Accueil) — shown at J-7…J-1 before the trial
   flips back to Free. Distinct from the config checklist and the Free→Pro
   teaser; dismissable for the day but reappears the next day (P6). ── */
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
    <TouchableOpacity
      style={proStyles.wrapper}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title} · ${t('home.trialEndCta')}`}
    >
      <LinearGradient
        colors={['#0f031e', '#1a0533']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={proStyles.gradient}
      >
        <View style={proStyles.iconWrap}>
          <Clock size={15} color={palette.gold} strokeWidth={2} />
        </View>
        <View style={proStyles.textWrap}>
          <Text style={proStyles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          <Text style={proStyles.desc} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {desc}
          </Text>
        </View>
        <Text style={proStyles.cta} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {t('home.trialEndCta')}
        </Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={HIT_SLOP_LARGE}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={proStyles.dismissBtn}
        >
          <X size={15} color="rgba(255,255,255,0.55)" strokeWidth={2} />
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );
});

export default function HomeScreen() {
  const merchant = useAuthStore((s) => s.merchant);
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const { focusStyle } = useFocusFade();
  const insets = useSafeAreaInsets();
  const { data: unreadData } = useAdminNotifUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  // Android: "press back again to exit" on the home tab
  useExitOnBack();

  // ── Premium gate for the dashboard shortcut (mirrors the Compte screen) ──
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

  // ── Aggregated KPI + month scans — computed server-side over ALL rows (not
  // just the first transactions page), so today's total, the "vs hier" delta and
  // the month chart stay correct for high-volume merchants. Live via WS events. ──
  const { data: homeStats, isLoading: statsLoading, refetch: refetchStats } = useHomeStats();
  const isStamps = merchant?.loyaltyType === 'STAMPS';
  const { kpiValue, deltaPct, deltaSign, deltaPositive, clientsToday } = useMemo(() => {
    const today = homeStats?.today.points ?? 0;
    const yesterday = homeStats?.yesterday.points ?? 0;
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

  // ── Recent activity: the 5 most recent transactions for the grouped card. ──
  const recentTransactions = useMemo<Transaction[]>(() => transactions.slice(0, 5), [transactions]);

  const onRefresh = useGuardedCallback(async () => {
    await Promise.all([refetch(), refetchStats()]);
  }, [refetch, refetchStats]);

  // ── Navigation shortcuts (Compte via avatar · Dashboard · Notifications) ──
  const avatarTourRef = useTourTarget('avatar');
  const dashboardTourRef = useTourTarget('dashboard');
  const goToAccount = useCallback(() => router.push('/account'), [router]);
  const goToStorePreview = useCallback(() => router.push('/store-preview?mode=edit&view=preview&autoPreview=1' as never), [router]);
  const goToDashboard = useCallback(() => {
    // Same premium gating as Compte → Mon commerce → Dashboard
    if (merchant?.plan !== 'PREMIUM') {
      setPremiumModal({ visible: true, titleKey: 'account.dashboardLockedTitle', descKey: 'account.dashboardLockedMsg' });
      return;
    }
    router.push('/dashboard');
  }, [merchant?.plan, router]);
  const goToNotifications = useCallback(() => router.push('/admin-notifications'), [router]);
  const goToPlan = useCallback(() => router.push('/plan'), [router]);
  const goToTransactions = useCallback(() => router.push('/transactions'), [router]);

  // ── Header quick actions (store management) ──
  const quickActions = useMemo<QuickAction[]>(
    () => [
      { key: 'stores', label: t('home.qaStores'), Icon: Store, route: '/stores', tourKey: 'stores' },
      { key: 'loyalty', label: t('home.qaLoyalty'), Icon: Coins, route: '/settings', tourKey: 'loyalty' },
      { key: 'storecard', label: t('home.qaStoreCard'), Icon: CreditCard, route: '/store-preview?mode=edit&view=preview', tourKey: 'storecard' },
      { key: 'team', label: t('home.qaTeam'), Icon: Users, route: '/team-management', premium: true, tourKey: 'team' },
      { key: 'wheel', label: t('home.qaWheel'), Icon: Ticket, route: '/lucky-wheel', premium: true, tourKey: 'wheel' },
    ],
    [t],
  );

  // Discrete upgrade teaser only for merchants still on the Free plan.
  const isFreePlan = merchant?.plan === 'FREE';

  // ── Premium trial-end reminder (J-7…J-1) ──────────────────────────────
  // Mirrors the trial detection used on the Compte subscription card:
  // a real trial is PREMIUM, not admin-activated, with both dates present.
  const trialDaysLeft = useMemo(() => {
    if (merchant?.plan !== 'PREMIUM' || merchant?.planActivatedByAdmin) return null;
    if (!merchant?.planExpiresAt || !merchant?.trialStartedAt) return null;
    const exp = new Date(merchant.planExpiresAt);
    if (Number.isNaN(exp.getTime())) return null;
    return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }, [merchant?.plan, merchant?.planActivatedByAdmin, merchant?.planExpiresAt, merchant?.trialStartedAt]);

  // Today as YYYY-MM-DD (local) — used to reset the dismissal every new day.
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [trialBannerDismissedDay, setTrialBannerDismissedDay] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.TRIAL_END_BANNER_DISMISSED_DAY)
      .then((v) => { if (active) setTrialBannerDismissedDay(v); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const dismissTrialBanner = useCallback(() => {
    setTrialBannerDismissedDay(todayKey);
    AsyncStorage.setItem(ASYNC_STORAGE_KEYS.TRIAL_END_BANNER_DISMISSED_DAY, todayKey).catch(() => {});
  }, [todayKey]);
  const showTrialBanner =
    trialDaysLeft != null && trialDaysLeft >= 1 && trialDaysLeft <= 7 && trialBannerDismissedDay !== todayKey;

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
        onScrollBeginDrag={pokeInteraction}
        onTouchStart={pokeInteraction}
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
        {/* ── Hero (scrolls) — one continuous brand gradient reaching the top of
            the screen, behind the floating top bar (no visible seam) ── */}
        <LinearGradient
          colors={brandGradientFull}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top + TOP_BAR_HEIGHT + 8 }]}
        >
          <View style={styles.kpiBlock}>
          <View style={styles.kpiLabelRow}>
            <Coins size={13} color="rgba(255,255,255,0.72)" strokeWidth={2} />
            <Text style={styles.kpiLabel} maxFontSizeMultiplier={1.4}>
              {isStamps ? t('home.kpiStamps') : t('home.kpiPoints')}
            </Text>
          </View>
          <View style={styles.kpiValueRow}>
            <KpiCounter value={kpiValue} ready={!statsLoading} style={styles.kpiValue} />
            {isStamps ? (
              <Stamp size={26} color={palette.gold} strokeWidth={2.2} />
            ) : (
              <Star size={26} color={palette.gold} fill={palette.gold} strokeWidth={0} />
            )}
          </View>
          <View style={styles.kpiSubRow}>
            {deltaPositive ? (
              <TrendingUp size={13} color={palette.gold} strokeWidth={2.2} />
            ) : (
              <TrendingDown size={13} color={palette.gold} strokeWidth={2.2} />
            )}
            <Text style={styles.kpiSub} maxFontSizeMultiplier={1.4}>
              {t('home.vsYesterday', { sign: deltaSign, percent: deltaPct })} · {t('home.clientsScanned', { count: clientsToday })}
            </Text>
          </View>
        </View>

        <MonthOverviewCard daily={monthDaily} />

        <QuickActionsRow items={quickActions} />
        </LinearGradient>

        {/* ── Content (scrolls with the hero) ── */}
        <View style={styles.content}>
          {/* Setup checklist — auto-hides at 100% */}
          <SetupChecklist />

          {/* Tips carousel — usage guide & why-loyalty */}
          <TipsCarousel />

          {showTrialBanner && trialDaysLeft != null && (
            <View style={{ paddingTop: 12 }}>
              <TrialEndBanner
                daysRemaining={trialDaysLeft}
                onPress={goToPlan}
                onDismiss={dismissTrialBanner}
              />
            </View>
          )}

          {isFreePlan && (
            <View style={{ paddingTop: 12 }}>
              <ProUpgradeBanner onPress={goToPlan} />
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
            {t('home.recentActivity')}
          </Text>

          {isError && transactions.length === 0 && !loading ? (
            <View style={styles.emptyInline}>
              <View style={[styles.emptyIllustration, { backgroundColor: `${theme.danger}14` }]}>
                <AlertCircle size={ms(36)} color={theme.danger} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
                {t('common.errorTitle', { defaultValue: 'Erreur de chargement' })}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                {t('common.errorHint', { defaultValue: 'Vérifiez votre connexion et réessayez.' })}
              </Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  safeImpact(Haptics.ImpactFeedbackStyle.Light);
                  refetch();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('common.retry', { defaultValue: 'Réessayer' })}
              >
                <Text style={styles.retryBtnText} maxFontSizeMultiplier={1.4}>
                  {t('common.retry', { defaultValue: 'Réessayer' })}
                </Text>
              </TouchableOpacity>
            </View>
          ) : showSkeleton ? (
            <ActivityListSkeleton count={6} />
          ) : recentTransactions.length > 0 ? (
            <RecentActivityCard
              transactions={recentTransactions}
              merchantLoyaltyType={merchant?.loyaltyType}
              onViewAll={goToTransactions}
            />
          ) : (
            <View style={styles.emptyInline}>
              <View style={[styles.emptyIllustration, { backgroundColor: `${palette.charbon}12` }]}>
                <Zap size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
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

      {/* ── Floating top bar — overlaid on the hero gradient and PERMANENTLY
          transparent (no scroll-driven background). Design trade-off: once the
          white content scrolls up behind it, the white greeting text may lose
          contrast — this is a deliberate, validated choice. If readability
          becomes an issue in real use, add a subtle text shadow rather than
          reintroducing a bar background. Icon circles keep their own individual
          translucent fill (rgba(255,255,255,.14)). ── */}
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
                <View style={styles.avatarBadge} importantForAccessibility="no">
                  <Text style={styles.avatarBadgeText} maxFontSizeMultiplier={1.2}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.greeting}>
              <Text style={styles.greetingHi} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {t('home.greeting')}
              </Text>
              <Text style={styles.greetingShop} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {merchant?.nom ?? ''}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={goToStorePreview}
              activeOpacity={0.8}
              hitSlop={HIT_SLOP_LARGE}
              accessibilityRole="button"
              accessibilityLabel={t('home.previewStore')}
            >
              <Eye size={18} color="#fff" strokeWidth={1.8} />
            </TouchableOpacity>
            <TouchableOpacity
              ref={dashboardTourRef}
              style={styles.iconBtn}
              onPress={goToDashboard}
              activeOpacity={0.8}
              hitSlop={HIT_SLOP_LARGE}
              accessibilityRole="button"
              accessibilityLabel={t('home.openDashboard')}
            >
              <BarChart3 size={18} color="#fff" strokeWidth={1.8} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={goToNotifications}
              activeOpacity={0.8}
              hitSlop={HIT_SLOP_LARGE}
              accessibilityRole="button"
              accessibilityLabel={t('home.openNotifications')}
            >
              <Bell size={17} color="#fff" strokeWidth={1.8} />
              {unreadCount > 0 && <View style={[styles.iconBtnDot, { borderColor: palette.violetDeep }]} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Premium gate for the dashboard shortcut (same as the Compte screen) ── */}
      <PremiumLockModal
        visible={premiumModal.visible}
        onClose={closePremiumModal}
        titleKey={premiumModal.titleKey}
        descKey={premiumModal.descKey}
      />
    </Animated.View>
  );
}

/* ── Premium Styles ── */
const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Scrollable content below the header */
  content: { paddingHorizontal: 16, paddingTop: 14 },
  emptyInline: { alignItems: 'center', paddingTop: 48 },

  /* Brand-gradient hero (scrolls) */
  heroGradient: {
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  /* Floating top bar (absolute overlay, transparent at rest) */
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
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.violetLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  avatarWrap: { position: 'relative' },
  avatarBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
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
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Lexend_700Bold',
  },
  greeting: { flexShrink: 1 },
  greetingHi: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend_500Medium',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  greetingShop: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.20)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
  },

  /* KPI block */
  kpiBlock: {
    alignItems: 'center',
    paddingTop: 4,
  },
  kpiLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  kpiLabel: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Lexend_500Medium',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  kpiValue: {
    fontSize: 38,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  kpiSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  kpiSub: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.gold,
    fontFamily: 'Lexend_600SemiBold',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  /* Section title */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
    marginTop: 16,
    marginBottom: 10,
  },

  /* Empty state */
  emptyIllustration: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 48,
    lineHeight: 22,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },

  /* Retry button */
  retryBtn: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Lexend_600SemiBold',
  },
});

/* ── Pro upgrade teaser styles ── */
const proStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.28)',
    borderRadius: 12,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(252,211,77,0.14)',
  },
  textWrap: { flex: 1 },
  title: {
    fontSize: 13,
    color: '#fff',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.62)',
    fontFamily: 'Lexend_400Regular',
    marginTop: 1,
  },
  cta: {
    fontSize: 12,
    color: palette.gold,
    fontFamily: 'Lexend_600SemiBold',
  },
  dismissBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

