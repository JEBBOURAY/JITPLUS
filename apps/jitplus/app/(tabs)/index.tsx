import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, FlatList, RefreshControl, StyleSheet, Animated,
  TouchableOpacity, Keyboard, Pressable, Platform,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { StatusBar } from 'expo-status-bar';
import { getInitials, getProfileCompletion } from '@/utils/profileCompletion';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CreditCard, AlertCircle, Gift, Search, X, Bell,
  QrCode, Compass, RotateCcw, GalleryHorizontal, LayoutList, Sparkles,
} from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import GuestGuard from '@/components/GuestGuard';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoyaltyCard } from '@/types';
import { useRouter } from 'expo-router';
import FadeInView from '@/components/FadeInView';
import ReferralPopup from '@/components/home/ReferralPopup';
import LuckyWheelModal from '@/components/LuckyWheelModal';
import Skeleton from '@/components/Skeleton';
import WalletPasses from '@/components/home/WalletPasses';
import CardCarousel, { getWalletCardSize } from '@/components/home/CardCarousel';
import { wp, hp, ms, fontSize, radius, SCREEN } from '@/utils/responsive';
import { useAppFonts } from '@/utils/fonts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import CardItem from '@/components/home/CardItem';
import { useHomeData } from '@/hooks/useHomeData';
import { useHomeBanners } from '@/hooks/useHomeBanners';
import { usePendingScratchCards, useActiveCoupons } from '@/hooks/useScratchHooks';
import { useLuckyWheelHistory } from '@/hooks/useQueryHooks';
import type { CouponDto, ScratchCardDto } from '@jitplus/shared/src/scratch';
import type { LuckyWheelDraw } from '@/types';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const NO_SCRATCH_CARDS: ScratchCardDto[] = [];
const NO_COUPONS: CouponDto[] = [];
const NO_DRAWS: LuckyWheelDraw[] = [];
const NO_CARDS: LoyaltyCard[] = [];
const GRADIENT_VIOLET = [palette.violetDark, palette.violet] as const;
const GRADIENT_EMERALD = ['#10B981', '#059669'] as const;
const GRADIENT_H_START = { x: 0, y: 0 } as const;
const GRADIENT_H_END = { x: 1, y: 0 } as const;
const SCROLLED_THRESHOLD = 4;
const VIEW_MODE_KEY = '@jitplus_cards_view';
type ViewMode = 'wallet' | 'list';

export default function HomeScreen() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client, isGuest } = useAuth();
  const isDark = theme.mode === 'dark';
  const [isScrolled, setIsScrolled] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('wallet');

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((v) => { if (v === 'list' || v === 'wallet') setViewMode(v); })
      .catch(() => {});
  }, []);

  const toggleViewMode = useCallback(() => {
    haptic();
    setViewMode((m) => {
      const next: ViewMode = m === 'wallet' ? 'list' : 'wallet';
      AsyncStorage.setItem(VIEW_MODE_KEY, next).catch(() => {});
      return next;
    });
  }, []);
  const isWallet = viewMode === 'wallet';

  useExitOnBack(true, t('common.pressBackToExit'));

  const homeData = useHomeData(client);
  const banners = useHomeBanners(homeData.notifData, homeData.luckyWheelTickets);
  const pendingScratch = usePendingScratchCards(!!client && !isGuest);
  const activeCoupons = useActiveCoupons(!!client && !isGuest);
  const wheelHistory = useLuckyWheelHistory(!!client && !isGuest);
  const pendingScratchCards = pendingScratch.data ?? NO_SCRATCH_CARDS;
  const activeCouponList = activeCoupons.data ?? NO_COUPONS;
  const drawHistory = wheelHistory.data ?? NO_DRAWS;

  const wonPrizes = useMemo(() => {
    const now = Date.now();
    return drawHistory.filter((d) =>
      d.result === 'WON' && d.fulfilment === 'PENDING' && (!d.claimBefore || new Date(d.claimBefore).getTime() > now),
    );
  }, [drawHistory]);

  const allCards = homeData.stampsData?.cards ?? NO_CARDS;
  const totalCards = homeData.stampsData?.totalCards ?? allCards.length;

  const isFiltering = !!homeData.debouncedSearch;

  const handleRefresh = useGuardedCallback(async () => {
    haptic();
    await Promise.all([
      homeData.refetch(),
      pendingScratch.refetch(),
      activeCoupons.refetch(),
      wheelHistory.refetch(),
    ]);
  }, [homeData.refetch, pendingScratch.refetch, activeCoupons.refetch, wheelHistory.refetch]);

  const handleCardPress = useCallback((merchantId: string) => {
    haptic(HapticStyle.Medium);
    router.push({ pathname: '/merchant/[id]', params: { id: merchantId } });
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

  const { setSearchQuery, refetch } = homeData;
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  const { setShowLuckyWheel } = banners;
  const handleLuckyWheelOpen = useCallback(() => {
    haptic(HapticStyle.Medium);
    setShowLuckyWheel(true);
  }, [setShowLuckyWheel]);

  const handleLuckyWheelClose = useCallback(() => {
    setShowLuckyWheel(false);
  }, [setShowLuckyWheel]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolled = e.nativeEvent.contentOffset.y > SCROLLED_THRESHOLD;
    setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
  }, []);

  const renderCard = useCallback(({ item: card }: { item: LoyaltyCard }) => (
    <CardItem
      card={card}
      t={t}
      locale={locale}
      searchHighlight={homeData.debouncedSearch}
      theme={theme}
      onPress={handleCardPress}
    />
  ), [handleCardPress, t, locale, homeData.debouncedSearch, theme]);

  const keyExtractor = useCallback((item: LoyaltyCard) => item.id, []);

  const firstName = client?.prenom || '';

  const listHeader = useMemo(() => {
    const showToolbar = homeData.isLoading || allCards.length > 0;
    const showPasses = !!client && !homeData.debouncedSearch;

    return (
      <>
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

        {/* ── Wallet passes: scratch cards, lucky wheel, won prizes, coupons ── */}
        {showPasses && (
          <FadeInView delay={90} distance={hp(12)}>
            <WalletPasses
              scratchCards={pendingScratchCards}
              coupons={activeCouponList}
              wonPrizes={wonPrizes}
              ticketCount={homeData.luckyWheelTickets.length}
              spinAnim={banners.luckyWheelSpinAnim}
              onOpenWheel={handleLuckyWheelOpen}
            />
          </FadeInView>
        )}

        {/* ── Section toolbar: title + view mode ── */}
        {showToolbar && (
          <View style={styles.toolbar}>
            <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1}>
              {isFiltering
                ? t('home.results', { count: homeData.cards.length })
                : t('home.allCards')}
            </Text>
            <TouchableOpacity
              style={[styles.viewToggle, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={toggleViewMode}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={isWallet ? t('home.viewList') : t('home.viewWallet')}
            >
              {isWallet
                ? <LayoutList size={ms(16)} color={theme.text} strokeWidth={2} />
                : <GalleryHorizontal size={ms(16)} color={theme.text} strokeWidth={2} />}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Wallet carousel ── */}
        {isWallet && !homeData.isLoading && homeData.cards.length > 0 && (
          <CardCarousel
            cards={homeData.cards}
            onCardPress={handleCardPress}
          />
        )}

        {/* ── Loading skeletons ── */}
        {homeData.isLoading && isWallet && (
          <FadeInView delay={150} style={styles.walletSkeleton}>
            {(() => {
              const size = getWalletCardSize(SCREEN.width);
              const side = { width: size.width * 0.8, height: size.height * 0.8 };
              const sideOffset = SCREEN.width / 2 - size.step - side.width / 2;
              return (
                <View style={[styles.walletSkeletonRow, { height: size.height }]}>
                  <Skeleton width={side.width} height={side.height} borderRadius={radius['2xl']} style={{ position: 'absolute', left: sideOffset, opacity: 0.6 }} />
                  <Skeleton width={side.width} height={side.height} borderRadius={radius['2xl']} style={{ position: 'absolute', right: sideOffset, opacity: 0.6 }} />
                  <Skeleton width={size.width} height={size.height} borderRadius={radius['2xl']} />
                </View>
              );
            })()}
            <Skeleton width="100%" height={hp(120)} borderRadius={radius.xl} style={{ marginTop: hp(30) }} />
          </FadeInView>
        )}
        {homeData.isLoading && !isWallet && (
          <FadeInView delay={150}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.skeletonCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <View style={styles.skeletonHeader}>
                  <Skeleton width={ms(48)} height={ms(48)} borderRadius={ms(14)} />
                  <View style={styles.skeletonHeaderText}>
                    <Skeleton width="70%" height={hp(14)} borderRadius={6} />
                    <Skeleton width="40%" height={hp(10)} borderRadius={5} />
                  </View>
                  <Skeleton width={ms(40)} height={hp(22)} borderRadius={8} />
                </View>
                <View style={styles.skeletonDots}>
                  {Array.from({ length: 10 }, (_, d) => (
                    <Skeleton key={d} width={ms(22)} height={ms(22)} borderRadius={ms(11)} />
                  ))}
                </View>
                <Skeleton width="55%" height={hp(10)} borderRadius={5} />
              </View>
            ))}
          </FadeInView>
        )}
      </>
    );
  }, [
    homeData.isLoading, homeData.loadError, homeData.debouncedSearch,
    refetch, allCards.length, theme, fonts, t, client, isFiltering,
    pendingScratchCards, activeCouponList, wonPrizes, homeData.luckyWheelTickets.length,
    banners.luckyWheelSpinAnim, handleLuckyWheelOpen,
    isWallet, toggleViewMode, homeData.cards, handleCardPress,
  ]);

  const listEmpty = useMemo(() => {
    if (homeData.isLoading || (isWallet && homeData.cards.length > 0)) return null;
    const isFilterEmpty = isFiltering && homeData.cards.length === 0;
    return (
      <FadeInView delay={80} style={styles.emptyWrap}>
        <View style={[styles.emptyIcon, { backgroundColor: isFilterEmpty ? `${palette.violet}12` : `${palette.gold}18` }]}>
          {isFilterEmpty
            ? <Search size={ms(34)} color={isDark ? palette.violetLight : palette.violet} strokeWidth={1.6} />
            : <CreditCard size={ms(34)} color={palette.goldDark} strokeWidth={1.6} />}
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: fonts.bold }]}>
          {isFilterEmpty ? t('home.noSearchResults', { query: homeData.debouncedSearch }) : t('home.noCards')}
        </Text>
        {!isFilterEmpty && (
          <Text style={[styles.emptyHint, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('home.noCardsHint')}</Text>
        )}
        {isFilterEmpty ? (
          <TouchableOpacity
            style={[styles.emptySecondaryBtn, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
            onPress={handleClearSearch}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <X size={ms(15)} color={theme.text} strokeWidth={2} />
            <Text style={[styles.emptySecondaryText, { color: theme.text, fontFamily: fonts.semibold }]}>{t('home.clearSearch')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyActions}>
            <TouchableOpacity onPress={handleDiscover} activeOpacity={0.85} accessibilityRole="button" style={styles.emptyPrimaryShadow}>
              <LinearGradient colors={GRADIENT_VIOLET} start={GRADIENT_H_START} end={GRADIENT_H_END} style={styles.emptyPrimaryBtn}>
                <Compass size={ms(17)} color="#fff" strokeWidth={2} />
                <Text style={[styles.emptyPrimaryText, { fontFamily: fonts.bold }]}>{t('home.discoverCta')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.emptySecondaryBtn, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
              onPress={handleOpenQr}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <QrCode size={ms(16)} color={theme.text} strokeWidth={2} />
              <Text style={[styles.emptySecondaryText, { color: theme.text, fontFamily: fonts.semibold }]}>{t('home.showQr')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </FadeInView>
    );
  }, [isWallet, homeData.isLoading, homeData.cards.length, homeData.debouncedSearch, isFiltering, theme, isDark, fonts, t, handleClearSearch, handleDiscover, handleOpenQr]);

  if (isGuest) return <GuestGuard />;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + hp(10), backgroundColor: theme.bg, borderBottomColor: isScrolled ? theme.border : 'transparent' },
          isScrolled && !isDark && styles.headerShadow,
        ]}
      >
        {homeData.showSearch ? (
          <View style={styles.searchRow}>
            <View style={[styles.searchField, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <Search size={ms(18)} color={theme.textMuted} strokeWidth={2} />
              <TextInput
                ref={homeData.searchInputRef}
                style={[styles.searchInput, { color: theme.text, fontFamily: fonts.regular }]}
                placeholder={t('home.searchPlaceholder')}
                placeholderTextColor={theme.textMuted}
                value={homeData.searchQuery}
                onChangeText={homeData.setSearchQuery}
                returnKeyType="search"
                onSubmitEditing={Keyboard.dismiss}
                autoCorrect={false}
                autoFocus
              />
              {homeData.searchQuery.length > 0 && (
                <Pressable onPress={handleClearSearch} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('home.clearSearch')}>
                  <View style={[styles.clearPill, { backgroundColor: theme.textMuted }]}>
                    <X size={ms(11)} color={theme.bg} strokeWidth={3} />
                  </View>
                </Pressable>
              )}
            </View>
            <TouchableOpacity onPress={homeData.toggleSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('home.closeSearch')}>
              <Text style={[styles.cancelText, { color: isDark ? palette.violetLight : palette.violet, fontFamily: fonts.semibold }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.titleRow}>
            <TouchableOpacity
              style={[styles.avatar, { backgroundColor: isDark ? `${palette.violet}30` : `${palette.violet}14`, borderColor: theme.border }]}
              activeOpacity={0.8}
              onPress={openProfile}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.profile')}
            >
              <Text style={[styles.avatarText, { color: isDark ? palette.violetLight : palette.violet, fontFamily: fonts.bold }]} maxFontSizeMultiplier={1.2}>
                {getInitials(client)}
              </Text>
              {profileIncomplete && <View style={[styles.avatarDot, { backgroundColor: theme.danger, borderColor: theme.bg }]} />}
            </TouchableOpacity>
            <View style={styles.titleBlock}>
              {!!firstName && (
                <Text style={[styles.greeting, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
                  {t('home.greeting', { name: firstName })}
                </Text>
              )}
              <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1}>
                {t('home.title')}
              </Text>
            </View>
            {totalCards > 0 && (
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                activeOpacity={0.8}
                onPress={homeData.toggleSearch}
                accessibilityRole="button"
                accessibilityLabel={t('home.searchPlaceholder')}
              >
                <Search size={ms(19)} color={theme.text} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── Reward notification toast ── */}
      {banners.rewardBannerNotif && (
        <Animated.View
          style={[styles.rewardNotifBanner, {
            top: insets.top + hp(8),
            opacity: banners.rewardBannerAnim,
            transform: [{ translateY: banners.rewardBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity activeOpacity={0.9} onPress={() => { haptic(); router.push('/(tabs)/notifications'); banners.setRewardBannerNotif(null); }}>
            <LinearGradient colors={GRADIENT_EMERALD} start={GRADIENT_H_START} end={GRADIENT_H_END} style={styles.rewardNotifGradient}>
              <View style={styles.rewardNotifIcon}>
                <Bell size={ms(15)} color="#fff" strokeWidth={2} />
              </View>
              <Text style={[styles.rewardNotifText, { fontFamily: fonts.bold }]} numberOfLines={1}>
                {banners.rewardBannerNotif.merchantName
                  ? t('home.rewardBannerWithMerchant', { name: banners.rewardBannerNotif.merchantName })
                  : t('home.rewardBannerGeneric')}
              </Text>
              <Gift size={ms(15)} color="#fff" strokeWidth={2} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Welcome toast ── */}
      {banners.welcomeKind && !!firstName && !banners.rewardBannerNotif && (
        <Animated.View
          style={[styles.rewardNotifBanner, {
            top: insets.top + hp(8),
            opacity: banners.welcomeAnim,
            transform: [{ translateY: banners.welcomeAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <LinearGradient colors={GRADIENT_VIOLET} start={GRADIENT_H_START} end={GRADIENT_H_END} style={[styles.rewardNotifGradient, styles.welcomeGradient]}>
            <View style={styles.rewardNotifIcon}>
              <Sparkles size={ms(15)} color="#fff" strokeWidth={2} />
            </View>
            <Text style={[styles.rewardNotifText, { fontFamily: fonts.bold }]} numberOfLines={1}>
              {t(banners.welcomeKind === 'new' ? 'home.welcomeNew' : 'home.welcomeBack', { name: firstName })}
            </Text>
          </LinearGradient>
        </Animated.View>
      )}

      <FlatList
        data={homeData.isLoading || isWallet ? NO_CARDS : homeData.cards}
        renderItem={renderCard}
        keyExtractor={keyExtractor}
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: hp(130) + insets.bottom }} />}
        refreshControl={
          <RefreshControl refreshing={homeData.isRefetching} onRefresh={handleRefresh}
            tintColor={theme.primaryLight} colors={[theme.primary]} progressBackgroundColor={theme.bgCard} />
        }
        onScroll={handleScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={8}
        windowSize={9}
        initialNumToRender={6}
      />
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ReferralPopup visible={banners.showReferral} onClose={banners.dismissReferral} />

      <LuckyWheelModal visible={banners.showLuckyWheel} onClose={handleLuckyWheelClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(16), paddingTop: hp(6), flexGrow: 1 },

  // Header
  header: {
    paddingHorizontal: wp(20), paddingBottom: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: ms(46) },
  titleBlock: { flex: 1 },
  avatar: {
    width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1, marginEnd: wp(12),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: ms(15), letterSpacing: 0.4 },
  avatarDot: {
    position: 'absolute', top: 0, end: 0, width: ms(12), height: ms(12), borderRadius: ms(6), borderWidth: 2,
  },
  title: { fontSize: fontSize['3xl'], letterSpacing: -0.6 },
  greeting: { fontSize: fontSize.md, marginBottom: hp(1) },
  iconBtn: {
    width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: wp(12), minHeight: ms(46) },
  searchField: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: wp(10),
    height: ms(46), borderRadius: ms(14), borderWidth: 1, paddingHorizontal: wp(14),
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: 0 },
  clearPill: { width: ms(18), height: ms(18), borderRadius: ms(9), alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: fontSize.md },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    padding: wp(14), borderRadius: radius.lg, borderWidth: 1, marginTop: hp(6), marginBottom: hp(14),
  },
  errorBannerText: { fontSize: fontSize.sm, flex: 1 },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: wp(12), marginTop: hp(8), marginBottom: hp(10),
  },
  sectionTitle: { fontSize: fontSize.lg, letterSpacing: -0.3, flex: 1 },
  viewToggle: {
    width: ms(34), height: ms(34), borderRadius: ms(17), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  walletSkeleton: { paddingTop: hp(14) },
  walletSkeletonRow: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginHorizontal: -wp(16) },
  // Skeleton
  skeletonCard: {
    borderRadius: radius.xl, borderWidth: 1, padding: wp(16), marginBottom: hp(12), gap: hp(14),
  },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center' },
  skeletonHeaderText: { flex: 1, marginHorizontal: wp(12), gap: hp(8) },
  skeletonDots: { flexDirection: 'row', gap: wp(6), overflow: 'hidden' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(16), paddingVertical: hp(40) },
  emptyIcon: {
    width: ms(84), height: ms(84), borderRadius: ms(28),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(18),
  },
  emptyTitle: { fontSize: fontSize.lg, textAlign: 'center', letterSpacing: -0.2 },
  emptyHint: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20), marginTop: hp(6), maxWidth: wp(280) },
  emptyActions: { alignSelf: 'stretch', gap: hp(10), marginTop: hp(24), paddingHorizontal: wp(16) },
  emptyPrimaryShadow: {
    borderRadius: radius.lg,
    shadowColor: palette.violet, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 4,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    height: ms(50), borderRadius: radius.lg,
  },
  emptyPrimaryText: { color: '#fff', fontSize: fontSize.md },
  emptySecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    height: ms(48), borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: wp(18), marginTop: hp(4),
  },
  emptySecondaryText: { fontSize: fontSize.sm },

  // Reward toast
  rewardNotifBanner: { position: 'absolute', left: wp(16), right: wp(16), zIndex: 20 },
  rewardNotifGradient: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    paddingVertical: hp(10), paddingHorizontal: wp(12), borderRadius: radius.lg,
    shadowColor: '#059669', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  rewardNotifIcon: {
    width: ms(30), height: ms(30), borderRadius: ms(15),
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  rewardNotifText: { color: '#fff', fontSize: fontSize.sm, flex: 1 },
  welcomeGradient: { shadowColor: palette.violetDark },
});
