import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/AppText';
import { StatusBar } from 'expo-status-bar';
import { getInitials, getProfileCompletion } from '@/utils/profileCompletion';
import {
  CreditCard, AlertCircle, Gift, Bell,
  QrCode, Compass, RotateCcw, Sparkles,
} from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import { ScreenHeader } from '@/components/ScreenHeader';
import BirthdayPrompt from '@/components/home/BirthdayPrompt';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoyaltyCard } from '@/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isEntityId } from '@/utils/ids';
import FadeInView from '@/components/FadeInView';
import LuckyWheelModal from '@/components/LuckyWheelModal';
import EmptyState from '@/components/EmptyState';
import WalletPasses from '@/components/home/WalletPasses';
import CardCarousel from '@/components/home/CardCarousel';
import HomeToast from '@/components/home/HomeToast';
import WalletSkeleton from '@/components/home/WalletSkeleton';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { formatBadgeCount } from '@/utils/badge';
import { useAppFonts } from '@/utils/fonts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useScrolledHeader } from '@/hooks/useScrolledHeader';
import { CardContactSheet, openCardContact } from '@/components/home/CardQuickActions';
import { useHomeData } from '@/hooks/useHomeData';
import { useHomeBanners } from '@/hooks/useHomeBanners';
import { usePendingScratchCards, useActiveCoupons } from '@/hooks/useScratchHooks';
import { useLuckyWheelHistory, useUnreadNotificationCount } from '@/hooks/useQueryHooks';
import { useMyCollections } from '@/hooks/useCollectionHooks';
import type { CouponDto, ScratchCardDto } from '@jitplus/shared/src/scratch';
import type { LuckyWheelDraw } from '@/types';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const NO_SCRATCH_CARDS: ScratchCardDto[] = [];
const NO_COUPONS: CouponDto[] = [];
const NO_DRAWS: LuckyWheelDraw[] = [];

export default function HomeScreen() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useAuth();
  const isDark = theme.mode === 'dark';
  const { isScrolled, onScroll } = useScrolledHeader();

  useExitOnBack(true, t('common.pressBackToExit'));

  const enabled = !!client;
  const homeData = useHomeData(enabled);
  const banners = useHomeBanners(homeData.notifData, homeData.luckyWheelTickets);
  const pendingScratch = usePendingScratchCards(enabled);
  const myCollections = useMyCollections(enabled);
  const collectionCount = myCollections.data?.collections.length ?? 0;
  const activeCoupons = useActiveCoupons(enabled);
  const wheelHistory = useLuckyWheelHistory(enabled);
  const pendingScratchCards = pendingScratch.data ?? NO_SCRATCH_CARDS;
  const activeCouponList = activeCoupons.data ?? NO_COUPONS;
  const drawHistory = wheelHistory.data ?? NO_DRAWS;

  const wonPrizes = useMemo(() => {
    const now = Date.now();
    return drawHistory.filter((d) =>
      d.result === 'WON' && d.fulfilment === 'PENDING' && (!d.claimBefore || new Date(d.claimBefore).getTime() > now),
    );
  }, [drawHistory]);

  const pull = usePullToRefresh(async () => {
    haptic();
    await Promise.all([
      homeData.refetch(),
      homeData.refetchWheelTickets(),
      pendingScratch.refetch(),
      activeCoupons.refetch(),
      wheelHistory.refetch(),
      myCollections.refetch(),
    ]);
  });

  const handleCardPress = useCallback((merchantId: string) => {
    haptic(HapticStyle.Medium);
    // The client's own card: open the merchant page on its loyalty tab.
    router.push({ pathname: '/merchant/[id]', params: { id: merchantId, tab: 'loyalty' } });
  }, [router]);

  const handleBook = useCallback((merchantId: string) => {
    router.push({ pathname: '/book/[merchantId]', params: { merchantId } });
  }, [router]);

  const [contactCard, setContactCard] = useState<LoyaltyCard | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const handleContact = useCallback((card: LoyaltyCard) => {
    if (!openCardContact(card)) return;
    setContactCard(card);
    setContactOpen(true);
  }, []);
  const closeContact = useCallback(() => setContactOpen(false), []);

  const { data: unreadData } = useUnreadNotificationCount(enabled);
  const unreadCount = unreadData?.unreadCount ?? 0;
  const openNotifications = useCallback(() => {
    haptic(HapticStyle.Light);
    router.push('/notifications');
  }, [router]);

  const handleOpenQr = useCallback(() => {
    haptic(HapticStyle.Medium);
    router.push('/(tabs)/qr');
  }, [router]);

  const handleDiscover = useCallback(() => {
    haptic();
    router.push('/(tabs)/discover');
  }, [router]);

  const openProfile = useCallback(() => {
    haptic(HapticStyle.Light);
    router.push('/profile');
  }, [router]);
  const profileIncomplete = useMemo(() => !!client && getProfileCompletion(client, t).percent < 100, [client, t]);

  const { refetch } = homeData;

  const { setShowLuckyWheel, setRewardBannerNotif } = banners;
  const handleLuckyWheelOpen = useCallback(() => {
    haptic(HapticStyle.Medium);
    setWheelMerchantId(undefined);
    setShowLuckyWheel(true);
  }, [setShowLuckyWheel]);

  // A lucky-wheel notification opens the home tab with `?wheel=<merchantId>`:
  // show the wheel on that merchant's tickets, then drop the param so the next
  // tap triggers again.
  const { wheel: wheelParam } = useLocalSearchParams<{ wheel?: string }>();
  const [wheelMerchantId, setWheelMerchantId] = useState<string>();
  useEffect(() => {
    if (!wheelParam) return;
    router.setParams({ wheel: undefined });
    if (!client) return;
    setWheelMerchantId(isEntityId(wheelParam) ? wheelParam : undefined);
    setShowLuckyWheel(true);
  }, [wheelParam, client, router, setShowLuckyWheel]);

  const handleLuckyWheelClose = useCallback(() => {
    setShowLuckyWheel(false);
  }, [setShowLuckyWheel]);

  const firstName = client?.prenom || '';
  const showEmpty = !homeData.isLoading && !homeData.loadError && homeData.cards.length === 0;

  const handleRewardToastPress = useCallback(() => {
    haptic();
    router.push('/notifications');
    setRewardBannerNotif(null);
  }, [router, setRewardBannerNotif]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <ScreenHeader isScrolled={isScrolled} style={styles.headerGutter}>
        <View style={styles.titleRow}>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: isDark ? `${palette.violet}30` : `${palette.violet}14`, borderColor: theme.border }]}
            activeOpacity={0.8}
            onPress={openProfile}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.profile')}
          >
            <Text style={[styles.avatarText, { color: theme.primary, fontFamily: fonts.bold }]} maxFontSizeMultiplier={1.2}>
              {getInitials(client)}
            </Text>
            {profileIncomplete && <View style={[styles.avatarDot, { backgroundColor: theme.danger, borderColor: theme.bg }]} />}
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            {!!firstName && (
              <Text style={[styles.greeting, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>
                {t('home.greeting', { name: firstName })}
              </Text>
            )}
          </View>
          {/* Notifications live behind this bell; the tab bar keeps its room for appointments. */}
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            activeOpacity={0.8}
            onPress={openNotifications}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0
              ? `${t('tabs.notifications')}, ${t('notifications.unreadCount', { count: unreadCount })}`
              : t('tabs.notifications')}
          >
            <Bell size={ms(20)} color={theme.text} strokeWidth={2} />
            {unreadCount > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: theme.danger, borderColor: theme.bg }]}>
                <Text style={[styles.bellBadgeText, { fontFamily: fonts.bold }]} maxFontSizeMultiplier={1.2}>
                  {formatBadgeCount(unreadCount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScreenHeader>

      {/* ── Reward notification toast ── */}
      {banners.rewardBannerNotif && (
        <HomeToast
          anim={banners.rewardBannerAnim}
          tone="gold"
          icon={Bell}
          trailingIcon={Gift}
          text={banners.rewardBannerNotif.merchantName
            ? t('home.rewardBannerWithMerchant', { name: banners.rewardBannerNotif.merchantName })
            : t('home.rewardBannerGeneric')}
          onPress={handleRewardToastPress}
        />
      )}

      {/* ── Welcome toast ── */}
      {banners.welcomeKind && !!firstName && !banners.rewardBannerNotif && (
        <HomeToast
          anim={banners.welcomeAnim}
          tone="violet"
          icon={Sparkles}
          text={t(banners.welcomeKind === 'new' ? 'home.welcomeNew' : 'home.welcomeBack', { name: firstName })}
        />
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh}
            tintColor={theme.primaryLight} colors={[theme.primary]} progressBackgroundColor={theme.bgCard} />
        }
        onScroll={onScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
      >
        {homeData.loadError && !homeData.isLoading && (
          <FadeInView delay={50}>
            <TouchableOpacity
              style={[styles.errorBanner, { backgroundColor: `${theme.danger}10`, borderColor: `${theme.danger}25` }]}
              onPress={() => refetch()}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('home.reloadAccessibility')}
            >
              <AlertCircle size={ms(16)} color={theme.danger} strokeWidth={2} />
              <Text style={[styles.errorBannerText, { color: theme.danger, fontFamily: fonts.semibold }]}>{t('home.loadError')}</Text>
              <RotateCcw size={ms(15)} color={theme.danger} strokeWidth={2} />
            </TouchableOpacity>
          </FadeInView>
        )}

        {/* ── Wallet carousel ── */}
        {!homeData.isLoading && homeData.cards.length > 0 && (
          <CardCarousel
            cards={homeData.cards}
            onCardPress={handleCardPress}
            onBook={handleBook}
            onContact={handleContact}
          />
        )}

        {homeData.isLoading && <WalletSkeleton />}

        {showEmpty && (
          <EmptyState
            fadeInDelay={80}
            icon={CreditCard}
            iconColor={palette.goldDark}
            iconBg={`${palette.gold}18`}
            title={t('home.noCards')}
            hint={t('home.noCardsHint')}
            action={{ label: t('home.discoverCta'), icon: Compass, onPress: handleDiscover }}
            secondaryAction={{ label: t('home.showQr'), icon: QrCode, onPress: handleOpenQr }}
          />
        )}

        {/* Below the cards (the main content of the screen): birthday prompt, then the
            games and the gifts won there. Appointments live in the RDV tab. */}
        {!!client && (
          <>
            <BirthdayPrompt />

            <FadeInView delay={90} distance={hp(12)}>
              <WalletPasses
                scratchCards={pendingScratchCards}
                coupons={activeCouponList}
                wonPrizes={wonPrizes}
                ticketCount={homeData.luckyWheelTickets.length}
                collectionCount={collectionCount}
                spinAnim={banners.luckyWheelSpinAnim}
                onOpenWheel={handleLuckyWheelOpen}
              />
            </FadeInView>
          </>
        )}

        {/* Room for the floating tab bar */}
        <View style={{ height: hp(130) + insets.bottom }} />
      </ScrollView>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LuckyWheelModal visible={banners.showLuckyWheel} onClose={handleLuckyWheelClose} merchantId={wheelMerchantId} />
      <CardContactSheet card={contactCard} visible={contactOpen} onClose={closeContact} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(16), paddingTop: hp(6), flexGrow: 1 },

  // Header
  headerGutter: { paddingHorizontal: wp(16) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8), minHeight: ms(46) },
  titleBlock: { flex: 1 },
  avatar: {
    width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1, marginEnd: wp(4),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: ms(15), letterSpacing: 0.4 },
  avatarDot: {
    position: 'absolute', top: 0, end: 0, width: ms(12), height: ms(12), borderRadius: ms(6), borderWidth: 2,
  },
  greeting: { fontSize: fontSize.lg, letterSpacing: -0.3 },
  headerBtn: {
    width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -ms(2), end: -ms(2), minWidth: ms(20), height: ms(20), borderRadius: ms(10),
    paddingHorizontal: ms(5), borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  bellBadgeText: { color: '#fff', fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    padding: wp(14), borderRadius: radius.lg, borderWidth: 1, marginTop: hp(6), marginBottom: hp(14),
  },
  errorBannerText: { fontSize: fontSize.sm, flex: 1 },
});
