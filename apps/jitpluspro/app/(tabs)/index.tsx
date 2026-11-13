import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Clock } from 'lucide-react-native';
import { JitBell, JitPremium } from '@/components/icons';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { usePersistedFlag } from '@/hooks/usePersistedFlag';
import { useIsFocused } from 'expo-router/react-navigation';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminNotifUnreadCount, useHomeStats, useRewards } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import MerchantLogo from '@/components/MerchantLogo';
import TipsCarousel from '@/components/TipsCarousel';
import ToolsGrid, { type Tool } from '@/components/home/ToolsGrid';
import HomeGuide from '@/components/home/HomeGuide';
import HomeHero from '@/components/home/HomeHero';
import { useGuideSheetStore } from '@/components/home/guideSheetStore';
import { useStatsGate } from '@/hooks/useStatsGate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationPermissionSheet from '@/components/NotificationPermissionSheet';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import { radius } from '@/utils/responsive';
import { font, icon, TAB_BAR_HEIGHT } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import { wordInitials } from '@/utils/initials';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { DemoVideoModal } from '@/components/demo/DemoVideoModal';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
// Reserve space below the fixed header.
const TOP_BAR_HEIGHT = 68;
// Room under the last card for the WhatsApp button floating above the tab bar.
const FAB_CLEARANCE = 78;
// Illustrations of the tool cards.
const TOOL_IMAGE = {
  loyalty: require('@/assets/images/tools/fidelite.png'),
  games: require('@/assets/images/tools/jeux.png'),
  deals: require('@/assets/images/tools/bons_plans.png'),
  stampCodes: require('@/assets/images/tools/qr_colis.png'),
  stores: require('@/assets/images/tools/boutique.png'),
  plv: require('@/assets/images/tools/affiche_plv.png'),
  messages: require('@/assets/images/tools/notifications.png'),
  team: require('@/assets/images/tools/equipe.png'),
  guide: require('@/assets/images/tools/demarrage.png'),
  demos: require('@/assets/images/tools/videos_demos.png'),
} as const;
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
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium, isFreePlan, isTrial, daysRemaining } = usePlanStatus(merchant);
  const activeOnboardingSurface = useOnboardingStore((s) => s.active);
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const { data: unreadData } = useAdminNotifUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  // Android: "press back again to exit" on the home tab
  useExitOnBack();

  // Aggregated KPI + month scans are computed server-side over ALL rows (not
  // just the first transactions page), so today's total, the "vs hier" delta and
  // the month chart stay correct for high-volume merchants. Live via WS events.
  const {
    data: homeStats,
    isLoading: statsLoading,
    isRefetching: refreshing,
    refetch: refetchStats,
  } = useHomeStats();
  // Fidélité stays flagged until a first reward exists (same rule as the setup recap).
  const { data: rewards } = useRewards();
  // Owner only: a team member cannot create the reward, so the flag would be noise.
  const loyaltyTodo = !isTeamMember && rewards !== undefined && rewards.length === 0;
  const onRefresh = useGuardedCallback(async () => {
    await refetchStats();
  }, [refetchStats]);

  const goToAccount = useCallback(() => router.push('/account'), [router]);
  // Statistics are premium-gated: a free account gets the upgrade sheet.
  const { openStats, lockModal: statsLockModal } = useStatsGate(isPremium);
  const goToNotifications = useCallback(() => router.push('/admin-notifications'), [router]);
  const goToPlan = useCallback(() => router.push('/plan'), [router]);

  const openGuide = useGuideSheetStore((s) => s.open);
  // Steps of the guide still to do, shown on its card; null until known.
  const guideProgress = useGuideSheetStore((s) => s.progress);
  const guideLeft = guideProgress ? guideProgress.total - guideProgress.done : 0;
  const guideHint = !guideProgress
    ? t('home.toolSetupHint')
    : guideLeft <= 0
      ? t('home.toolSetupDone')
      : t(guideLeft === 1 ? 'home.toolSetupLeft_one' : 'home.toolSetupLeft_other', { count: guideLeft });
  const tools = useMemo<Tool[]>(
    () => [
      // Opens the step guide rendered by HomeGuide below.
      { key: 'guide', label: t('home.setupLabel'), hint: guideHint, image: TOOL_IMAGE.guide, onPress: openGuide, progress: guideProgress ?? undefined },
      { key: 'demos', label: t('home.qaDemos'), hint: t('home.toolDemosHint'), image: TOOL_IMAGE.demos, route: '/demo-videos' },
      {
        key: 'loyalty',
        label: t('home.qaLoyalty'),
        hint: t(loyaltyTodo ? 'home.toolTodo' : 'home.toolLoyaltyHint'),
        image: TOOL_IMAGE.loyalty,
        route: '/settings',
        alert: loyaltyTodo,
      },
      { key: 'stores', label: t('home.qaStore'), hint: t('home.toolStoreHint'), image: TOOL_IMAGE.stores, route: '/stores' },
      { key: 'plv', label: t('home.qaPlv'), hint: t('home.toolPlvHint'), image: TOOL_IMAGE.plv, route: '/posters' },
      { key: 'stampCodes', label: t('home.qaStampCodes'), hint: t('home.toolStampCodesHint'), image: TOOL_IMAGE.stampCodes, route: '/stamp-codes' },
      { key: 'team', label: t('home.qaTeam'), hint: t('home.toolTeamHint'), image: TOOL_IMAGE.team, route: '/team' },
      // Owner only: a team member cannot send notifications.
      ...(isTeamMember ? [] : [{ key: 'messages', label: t('home.qaMessages'), hint: t('home.toolMessagesHint'), image: TOOL_IMAGE.messages, route: '/messages' }]),
      { key: 'games', label: t('home.qaGames'), hint: t('home.toolGamesHint'), image: TOOL_IMAGE.games, route: '/games' },
      { key: 'deals', label: t('home.qaDeals'), hint: t('home.toolDealsHint'), image: TOOL_IMAGE.deals, route: '/deals' },
    ],
    [t, loyaltyTodo, openGuide, guideHint, guideProgress, isTeamMember],
  );

  const trialDaysLeft = isTrial ? daysRemaining : null;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { value: trialBannerDismissed, setValue: setTrialBannerDismissed } = usePersistedFlag(ASYNC_STORAGE_KEYS.TRIAL_END_BANNER_DISMISSED_DAY, todayKey);
  // Play the intro demo once per account on this device, and only once the
  // setup wizard is finished: never right after sign-up, nor behind the wizard.
  const setupFinished = merchant?.onboardingCompleted ?? true;
  const isFocused = useIsFocused();
  const { value: introSeen, setValue: setIntroSeen } = usePersistedFlag(`${ASYNC_STORAGE_KEYS.INTRO_DEMO_SEEN}_${merchant?.id ?? 'anon'}`);
  const [introOpen, setIntroOpen] = useState(false);
  useEffect(() => {
    if (!merchant?.id || !setupFinished || !isFocused || introSeen !== false) return;
    const timer = setTimeout(() => {
      if (!useOnboardingStore.getState().request('introVideo')) return;
      setIntroSeen(true);
      setIntroOpen(true);
    }, 900);
    return () => clearTimeout(timer);
  }, [merchant?.id, setupFinished, isFocused, introSeen, setIntroSeen]);
  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    useOnboardingStore.getState().release('introVideo');
  }, []);
  const dismissTrialBanner = useCallback(() => {
    setTrialBannerDismissed(true);
  }, [setTrialBannerDismissed]);
  const showTrialBanner =
    trialDaysLeft != null && trialDaysLeft >= 1 && trialDaysLeft <= 7 && trialBannerDismissed === false;

  const initials = useMemo(() => wordInitials(merchant?.nom), [merchant?.nom]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_HEIGHT + FAB_CLEARANCE }}
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
        <HomeHero
          stats={homeStats}
          loading={statsLoading}
          locked={!isPremium}
          topInset={insets.top + TOP_BAR_HEIGHT + 8}
          pageColor={theme.bg}
          onPress={openStats}
        />

        <View style={styles.content}>
          {!activeOnboardingSurface && (
            <View style={styles.tips}>
              <TipsCarousel />
            </View>
          )}

          <ToolsGrid title={t('home.tools')} tools={tools} />

          {!activeOnboardingSurface && showTrialBanner && (
            <View style={styles.bannerWrap}>
              <TrialEndBanner
                daysRemaining={trialDaysLeft}
                onPress={goToPlan}
                onDismiss={dismissTrialBanner}
              />
            </View>
          )}

          {!activeOnboardingSurface && isFreePlan && (
            <View style={styles.bannerWrap}>
              <ProUpgradeBanner onPress={goToPlan} />
            </View>
          )}
        </View>
      </ScrollView>

      <NotificationPermissionSheet enabled={!!merchant} />

      <View style={[styles.floatingTopBar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={[styles.headerTop, { flexDirection: dir.row }]}>
          <TouchableOpacity
            style={[styles.profile, { flexDirection: dir.row }]}
            onPress={goToAccount}
            activeOpacity={0.8}
            hitSlop={HIT_SLOP_LARGE}
            accessibilityRole="button"
            accessibilityLabel={t('home.openAccount')}
          >
            <View style={styles.avatar}>
              {merchant?.logoUrl ? (
                <MerchantLogo logoUrl={merchant.logoUrl} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitials} maxFontSizeMultiplier={1.2}>{initials}</Text>
              )}
            </View>
            <View style={styles.greeting}>
              <Text style={[styles.greetingHi, { textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {t('home.greeting')}
              </Text>
              <Text style={[styles.greetingShop, { textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {merchant?.nom ?? ''}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={goToNotifications}
            activeOpacity={0.8}
            hitSlop={HIT_SLOP_LARGE}
            accessibilityRole="button"
            accessibilityLabel={t('home.openNotifications')}
            accessibilityValue={unreadCount > 0 ? { text: String(unreadCount) } : undefined}
          >
            <JitBell size={20} color="#fff" strokeWidth={icon.stroke} />
            {unreadCount > 0 && (
              <View
                style={[
                  styles.iconBtnDot,
                  dir.isRTL ? { left: -3 } : { right: -3 },
                  { borderColor: palette.violetDeep, backgroundColor: theme.danger },
                ]}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <DemoVideoModal id="intro" visible={introOpen} onClose={closeIntro} />
      <HomeGuide />
      {statsLockModal}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  content: { paddingHorizontal: 16, paddingTop: 20 },
  bannerWrap: { paddingTop: 12 },
  // Above "Mes outils": the banners already reserve room on top for their overflowing icon.
  tips: { paddingBottom: 24 },

  floatingTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 30,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  headerTop: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  profile: {
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    fontSize: 17,
    color: palette.violetDark,
    fontFamily: font.semibold,
  },
  greeting: { flexShrink: 1 },
  greetingHi: {
    fontSize: 13,
    color: palette.heroMuted,
    fontFamily: font.medium,
  },
  greetingShop: {
    fontSize: 17,
    color: '#fff',
    fontFamily: font.semibold,
    letterSpacing: -0.3,
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDot: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
