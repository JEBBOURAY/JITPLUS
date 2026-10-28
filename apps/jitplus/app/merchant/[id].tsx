import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Pressable, Share, Alert, Animated, StyleSheet, Platform, useWindowDimensions,
  type ScrollView, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AlertCircle, Ban, Flag, LogOut } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import Skeleton from '@/components/Skeleton';
import ActionSheet, { type ActionSheetOption } from '@/components/ActionSheet';
import { useMerchantById } from '@/hooks/useQueryHooks';
import { useMerchantDeals } from '@/hooks/useDealHooks';
import { useKnownLocation } from '@/hooks/useKnownLocation';
import { api, getServerBaseUrl } from '@/services/api';
import { haptic, hapticSuccess } from '@/utils/haptics';
import { useAppFonts } from '@/utils/fonts';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { getFicheTabs, getOpenStatus, hasOpeningHours, type FicheTab } from '@jitplus/shared';
import { withDistances } from '@/utils/merchantStores';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';
import { isEntityId } from '@/utils/ids';
import {
  HERO_HEIGHT, TAB_BAR_HEIGHT, getStickyHeaderHeight, useMerchantLoyalty,
  MerchantHero, MerchantStickyHeader, MerchantQuickActions, MerchantTabs, MerchantLoyaltySummary, MerchantInfoSummary,
  MerchantLoyaltyCard, MerchantDeals, MerchantLuckyWheel, MerchantAbout, MerchantGallery, MerchantOpeningHours,
  MerchantLocations, MerchantBottomBar,
} from '@/components/merchant';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

type ReportReason = 'inappropriate' | 'spam' | 'fraud' | 'closed' | 'wrong_info' | 'other';
type SheetMode = 'none' | 'more' | 'report';

const REPORT_REASONS: { reason: ReportReason; labelKey: string }[] = [
  { reason: 'inappropriate', labelKey: 'merchant.reportReasonInappropriate' },
  { reason: 'spam', labelKey: 'merchant.reportReasonSpam' },
  { reason: 'fraud', labelKey: 'merchant.reportReasonFraud' },
  { reason: 'closed', labelKey: 'merchant.reportReasonClosed' },
  { reason: 'wrong_info', labelKey: 'merchant.reportReasonWrongInfo' },
  { reason: 'other', labelKey: 'merchant.reportReasonOther' },
];

/** Room for the fixed bottom bar so the last section stays reachable. */
const BOTTOM_BAR_SPACE = hp(96);
const OVERVIEW_DEALS = 2;

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();

  // A malformed deep-link id falls through to the "not found" state without a request.
  const validId = isEntityId(id);
  const { data: merchant, isLoading, error, refetch } = useMerchantById(id, validId);
  const userLocation = useKnownLocation();

  // The query already fetches on mount; refresh only when coming back to the screen.
  const hasFocusedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (hasFocusedRef.current) refetch();
    hasFocusedRef.current = true;
  }, [refetch]));

  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );

  const [sheet, setSheet] = useState<SheetMode>('none');
  const [joinLoading, setJoinLoading] = useState(false);
  const busyRef = useRef(false);

  const pageBg = theme.bg;

  const stores = useMemo(() => withDistances(merchant?.stores, userLocation), [merchant?.stores, userLocation]);
  const openStatus = useMemo(() => getOpenStatus(merchant?.openingHours), [merchant?.openingHours]);
  const loyalty = useMerchantLoyalty(merchant);

  // Guests only see the deal count from the merchant payload; skip the request when there is none.
  const { data: deals } = useMerchantDeals(merchant?.id, isAuthenticated && !!merchant && merchant.activeDealCount !== 0);

  const galleryCount = merchant?.gallery?.length ?? 0;
  const hasDealsTab = isAuthenticated && !!deals?.length;
  const tabs = useMemo(() => getFicheTabs({ hasDeals: hasDealsTab, photoCount: galleryCount }), [hasDealsTab, galleryCount]);
  const [tab, setTab] = useState<FicheTab>('overview');
  const activeTab = tabs.includes(tab) ? tab : 'overview';

  // The tab bar pins under the header bar: same translateY trick as RN sticky headers, native driver only.
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const [tabsY, setTabsY] = useState<number | null>(null);
  const pinOffset = getStickyHeaderHeight(insets.top);
  const pinAt = tabsY == null ? null : Math.max(0, tabsY - pinOffset);
  const tabsMotion = useMemo(() => (pinAt == null ? undefined : {
    transform: [{
      translateY: scrollY.interpolate({ inputRange: [pinAt, pinAt + 1], outputRange: [0, 1], extrapolateLeft: 'clamp' }),
    }],
  }), [scrollY, pinAt]);

  const onTabsLayout = useCallback((e: LayoutChangeEvent) => setTabsY(e.nativeEvent.layout.y), []);
  const recordOffset = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const selectTab = useCallback((next: FicheTab) => {
    setTab(next);
    // Past the pin point, start the new tab at its top instead of somewhere in the middle.
    if (pinAt != null && offsetRef.current > pinAt) {
      scrollRef.current?.scrollTo({ y: pinAt, animated: false });
      offsetRef.current = pinAt;
    }
  }, [pinAt]);
  const openLoyaltyTab = useCallback(() => selectTab('loyalty'), [selectTab]);
  const openDealsTab = useCallback(() => selectTab('deals'), [selectTab]);
  const openInfoTab = useCallback(() => selectTab('info'), [selectTab]);

  const patchMerchant = useCallback((patch: Partial<Merchant>) => {
    queryClient.setQueryData<Merchant>(['merchant', id], (m) => (m ? { ...m, ...patch } : m));
  }, [queryClient, id]);

  const refreshCards = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'stamps' || (q.queryKey[0] === 'merchant' && q.queryKey[1] === id),
    });
  }, [queryClient, id]);

  // Guests can browse the profile; card, report and block actions need an account.
  const promptLogin = useCallback(() => {
    Alert.alert(t('guest.loginRequired'), t('guest.loginRequiredDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('welcome.createAccount'), onPress: () => router.push('/register') },
      { text: t('welcome.login'), onPress: () => router.push('/login') },
    ], { cancelable: true });
  }, [router, t]);

  const handleJoin = useCallback(async () => {
    if (!isAuthenticated) { promptLogin(); return; }
    if (!id || busyRef.current) return;
    busyRef.current = true;
    setJoinLoading(true);
    try {
      const res = await api.joinMerchant(id);
      patchMerchant({ hasCard: true, cardDeactivated: false, cardBalance: res.card?.stamps ?? 0 });
      hapticSuccess();
      refreshCards();
    } catch (e) {
      if (__DEV__) console.warn('Join merchant error:', e);
      Alert.alert(t('common.error'), t('merchant.joinError'));
    } finally {
      busyRef.current = false;
      setJoinLoading(false);
    }
  }, [id, isAuthenticated, promptLogin, patchMerchant, refreshCards, t]);

  const handleLeave = useCallback(() => {
    if (!id || !merchant) return;
    const warning = t('merchant.leaveStampsWarning', { count: merchant.cardBalance ?? 0 });
    Alert.alert(t('merchant.leaveTitle'), `${warning}\n\n${t('merchant.leaveMessage')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchant.leaveConfirm'),
        style: 'destructive',
        onPress: async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          try {
            await api.leaveMerchant(id);
            patchMerchant({ hasCard: false, cardDeactivated: true, cardBalance: 0, cardStampsExpireAt: null });
            haptic();
            refreshCards();
          } catch (e) {
            if (__DEV__) console.warn('Leave merchant error:', e);
            Alert.alert(t('common.error'), t('merchant.leaveError'));
          } finally {
            busyRef.current = false;
          }
        },
      },
    ]);
  }, [id, merchant, patchMerchant, refreshCards, t]);

  const submitReport = useCallback(async (reason: ReportReason) => {
    if (!id || busyRef.current) return;
    busyRef.current = true;
    try {
      await api.reportMerchant(id, reason);
      haptic();
      Alert.alert(t('merchant.reportThanksTitle'), t('merchant.reportThanksBody'));
    } catch (e) {
      if (__DEV__) console.warn('Report merchant error:', e);
      Alert.alert(t('common.error'), t('merchant.reportError'));
    } finally {
      busyRef.current = false;
    }
  }, [id, t]);

  // Apple 1.2: blocking hides the merchant everywhere, then leaves the page.
  const handleBlock = useCallback(() => {
    if (!id) return;
    Alert.alert(t('merchant.blockTitle'), t('merchant.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchant.blockConfirm'),
        style: 'destructive',
        onPress: async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          try {
            await api.blockMerchant(id);
            haptic();
            queryClient.invalidateQueries({
              predicate: (q) => q.queryKey[0] === 'merchants' || (q.queryKey[0] === 'merchant' && q.queryKey[1] === id),
            });
            Alert.alert(t('merchant.blockedTitle'), t('merchant.blockedBody'), [
              { text: t('common.ok'), onPress: () => router.back() },
            ]);
          } catch (e) {
            if (__DEV__) console.warn('Block merchant error:', e);
            Alert.alert(t('common.error'), t('merchant.blockError'));
          } finally {
            busyRef.current = false;
          }
        },
      },
    ], { cancelable: true });
  }, [id, queryClient, router, t]);

  const handleShare = useCallback(async () => {
    if (!merchant) return;
    const shareUrl = `${getServerBaseUrl()}/m/${merchant.id}`;
    try {
      await Share.share({
        message: `${t('merchant.shareText', { name: merchant.nomBoutique })}\n\n${shareUrl}`,
        url: shareUrl, // iOS uses this for the rich link preview
      });
    } catch { /* user cancelled */ }
  }, [merchant, t]);

  const handleBack = useCallback(() => router.back(), [router]);
  const handleShowQr = useCallback(() => {
    if (!isAuthenticated) { promptLogin(); return; }
    haptic();
    router.push('/(tabs)/qr');
  }, [isAuthenticated, promptLogin, router]);
  const openMore = useCallback(() => {
    if (!isAuthenticated) { promptLogin(); return; }
    setSheet('more');
  }, [isAuthenticated, promptLogin]);
  const closeSheet = useCallback(() => setSheet('none'), []);

  const sheetOptions = useMemo<ActionSheetOption[]>(() => {
    if (sheet === 'report') {
      return REPORT_REASONS.map(({ reason, labelKey }) => ({
        key: reason, label: t(labelKey), onPress: () => { void submitReport(reason); },
      }));
    }
    return [
      ...(merchant?.hasCard
        ? [{ key: 'leave', label: t('merchant.leaveCard'), icon: LogOut, destructive: true, onPress: handleLeave }]
        : []),
      { key: 'report', label: t('merchant.reportTitle'), icon: Flag, keepOpen: true, onPress: () => setSheet('report') },
      { key: 'block', label: t('merchant.blockTitle'), icon: Ban, destructive: true, onPress: handleBlock },
    ];
  }, [sheet, merchant?.hasCard, t, submitReport, handleLeave, handleBlock]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: pageBg }]}>
        <Skeleton width="100%" height={HERO_HEIGHT} borderRadius={0} />
        <View style={styles.skeletonBody}>
          <Skeleton width={ms(90)} height={ms(90)} borderRadius={ms(20)} style={styles.skeletonLogo} />
          <Skeleton width={wp(200)} height={hp(24)} borderRadius={ms(6)} />
          <Skeleton width={wp(150)} height={hp(14)} borderRadius={ms(6)} />
          <Skeleton width={wp(260)} height={ms(38)} borderRadius={999} />
          <Skeleton width="100%" height={hp(140)} borderRadius={ms(8)} />
          <Skeleton width="100%" height={hp(100)} borderRadius={ms(8)} />
        </View>
      </View>
    );
  }

  if (!merchant || !loyalty) {
    const notFound = !error || (isAxiosError(error) && error.response?.status === 404);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <View style={[styles.errorIcon, { backgroundColor: theme.primaryBg }]}>
            <AlertCircle size={ms(28)} color={theme.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.errorTitle, { color: theme.text, fontFamily: fonts.bold }]}>
            {notFound ? t('merchant.notFound') : t('common.error')}
          </Text>
          <Text style={[styles.errorText, { color: theme.textMuted, fontFamily: fonts.regular }]}>
            {notFound ? t('merchant.notFoundDesc') : t('errors.generic')}
          </Text>
          <View style={styles.errorActions}>
            {!notFound && (
              <Pressable onPress={() => refetch()} style={[styles.errorButton, { backgroundColor: theme.primary }]} accessibilityRole="button">
                <Text style={[styles.errorButtonText, { fontFamily: fonts.bold }]}>{t('common.retry')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleBack}
              style={[styles.errorButton, notFound ? { backgroundColor: theme.primary } : { backgroundColor: theme.bgInput }]}
              accessibilityRole="button"
            >
              <Text style={[styles.errorButtonText, { fontFamily: fonts.bold }, !notFound && { color: theme.text }]}>
                {t('common.back')}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const accent = getMerchantAccent(merchant.themeColor);
  const wheel = merchant.activeLuckyWheel;

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onScrollEndDrag={recordOffset}
        onMomentumScrollEnd={recordOffset}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_BAR_SPACE }}
      >
        <MerchantHero
          merchant={merchant}
          scrollY={scrollY}
          openStatus={openStatus}
          distanceKm={stores[0]?.distanceKm ?? null}
        />
        <MerchantQuickActions merchant={merchant} stores={stores} />

        <Animated.View
          onLayout={onTabsLayout}
          style={[styles.tabs, { backgroundColor: pageBg, borderBottomColor: theme.border }, tabsMotion]}
        >
          <MerchantTabs tabs={tabs} active={activeTab} onChange={selectTab} />
        </Animated.View>

        {/* Tall enough for the tab bar to pin even when the active tab is short. */}
        <View style={[styles.sections, { minHeight: windowHeight - pinOffset - TAB_BAR_HEIGHT }]}>
          {activeTab === 'overview' && (
            <>
              <MerchantLoyaltySummary loyalty={loyalty} wheel={wheel} accent={accent} onOpen={openLoyaltyTab} />
              <MerchantDeals
                deals={deals}
                activeDealCount={merchant.activeDealCount}
                isAuthenticated={isAuthenticated}
                onLocked={promptLogin}
                limit={OVERVIEW_DEALS}
                onSeeAll={openDealsTab}
              />
              <MerchantInfoSummary
                hours={merchant.openingHours}
                status={openStatus}
                stores={stores}
                merchantName={merchant.nomBoutique}
                onOpen={openInfoTab}
              />
            </>
          )}
          {activeTab === 'loyalty' && (
            <>
              <MerchantLoyaltyCard loyalty={loyalty} accent={accent} />
              {wheel && <MerchantLuckyWheel wheel={wheel} />}
            </>
          )}
          {activeTab === 'deals' && (
            <MerchantDeals
              deals={deals}
              activeDealCount={merchant.activeDealCount}
              isAuthenticated={isAuthenticated}
              onLocked={promptLogin}
            />
          )}
          {activeTab === 'info' && (
            <>
              {/* Same order as the overview: where, when, then who. */}
              <MerchantLocations stores={stores} merchantName={merchant.nomBoutique} />
              {hasOpeningHours(merchant.openingHours) && (
                <MerchantOpeningHours hours={merchant.openingHours} />
              )}
              <MerchantAbout merchant={merchant} />
            </>
          )}
          {activeTab === 'photos' && <MerchantGallery images={merchant.gallery ?? []} />}
        </View>
      </Animated.ScrollView>

      <MerchantStickyHeader
        title={merchant.nomBoutique}
        scrollY={scrollY}
        onBack={handleBack}
        onShare={handleShare}
        onMore={openMore}
      />

      <MerchantBottomBar
        merchant={merchant}
        joinLoading={joinLoading}
        rewardReady={loyalty.hasReadyReward}
        onJoin={handleJoin}
        onShowQr={handleShowQr}
      />

      <ActionSheet
        visible={sheet !== 'none'}
        title={sheet === 'report' ? t('merchant.reportTitle') : merchant.nomBoutique}
        message={sheet === 'report' ? t('merchant.reportBody') : undefined}
        options={sheetOptions}
        cancelLabel={t('common.cancel')}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: {
    marginTop: hp(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    // Above the cards' Android elevation once pinned over them.
    ...Platform.select({ android: { elevation: 2 } }),
  },
  sections: { paddingHorizontal: wp(16) },

  skeletonBody: { alignItems: 'flex-start', paddingHorizontal: wp(16), gap: hp(12) },
  skeletonLogo: { marginTop: -ms(45) },

  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: wp(40) },
  errorIcon: { width: ms(64), height: ms(64), borderRadius: ms(22), alignItems: 'center', justifyContent: 'center', marginBottom: hp(16) },
  errorTitle: { fontSize: ms(20), marginBottom: hp(8), textAlign: 'center' },
  errorText: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(22), marginBottom: hp(24) },
  errorActions: { flexDirection: 'row', gap: wp(10) },
  errorButton: { paddingHorizontal: wp(24), paddingVertical: hp(12), borderRadius: ms(14) },
  errorButtonText: { color: '#fff', fontSize: ms(15) },
});
