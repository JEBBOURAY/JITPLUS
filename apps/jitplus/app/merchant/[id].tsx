import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Share, Alert, Animated, StyleSheet, Platform, useWindowDimensions,
  type ScrollView, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { savePendingMerchant, takePendingAutoJoin } from '@/services/pendingDeal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, Flag } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import Skeleton from '@/components/Skeleton';
import ActionSheet, { type ActionSheetOption } from '@/components/ActionSheet';
import DetailErrorState from '@/components/DetailErrorState';
import { useMerchantById } from '@/hooks/useQueryHooks';
import { useMerchantDeals } from '@/hooks/useDealHooks';
import { useMerchantCollection } from '@/hooks/useCollectionHooks';
import { useKnownLocation } from '@/hooks/useKnownLocation';
import { useBlockMerchant, useJoinMerchant, useLeaveMerchant, useReportMerchant } from '@/hooks/useMerchantActions';
import { usePromptLogin } from '@/hooks/usePromptLogin';
import { getServerBaseUrl } from '@/services/api';
import type { MerchantReportReason } from '@/services/api/merchants';
import { haptic, hapticSuccess } from '@/utils/haptics';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { getFicheTabs, getOpenStatus, type FicheTab } from '@jitplus/shared';
import { withDistances } from '@/utils/merchantStores';
import { wp, hp, ms, radius } from '@/utils/responsive';
import { isNotFoundError } from '@/utils/errorMessage';
import { isEntityId } from '@/utils/ids';
import {
  HERO_HEIGHT, TAB_BAR_HEIGHT, getStickyHeaderHeight, useMerchantLoyalty,
  MerchantHero, MerchantStickyHeader, MerchantQuickActions, MerchantTabs, MerchantShopInfo,
  MerchantLoyaltyCard, MerchantDeals, MerchantLuckyWheel, MerchantCollection, MerchantAbout, MerchantGallery,
  MerchantBottomBar, WelcomeGiftSheet,
} from '@/components/merchant';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

type SheetMode = 'more' | 'report';

const REPORT_REASONS: { reason: MerchantReportReason; labelKey: string }[] = [
  { reason: 'inappropriate', labelKey: 'merchant.reportReasonInappropriate' },
  { reason: 'spam', labelKey: 'merchant.reportReasonSpam' },
  { reason: 'fraud', labelKey: 'merchant.reportReasonFraud' },
  { reason: 'closed', labelKey: 'merchant.reportReasonClosed' },
  { reason: 'wrong_info', labelKey: 'merchant.reportReasonWrongInfo' },
  { reason: 'other', labelKey: 'merchant.reportReasonOther' },
];

/** Room for the fixed bottom bar (join, or member badge and leave) so the last section stays reachable. */
const BOTTOM_BAR_SPACE = hp(104);

export default function MerchantDetailScreen() {
  // tab=loyalty: opened from the client's own card (home, collections), straight to the progress.
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // A malformed deep-link id falls through to the "not found" state without a request.
  const validId = isEntityId(id);
  const { data: merchant, isLoading, error, refetch, isStale } = useMerchantById(id, validId);
  const userLocation = useKnownLocation();

  // The query already fetches on mount; refresh only when coming back to the screen.
  const hasFocusedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (hasFocusedRef.current && isStale) refetch({ cancelRefetch: false });
    hasFocusedRef.current = true;
  }, [refetch, isStale]));

  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );

  // Open state and content apart: the content must not flip back to the menu
  // while the sheet slides out after a report reason was picked.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetMode>('more');
  const [welcomeGift, setWelcomeGift] = useState(0);
  const { mutate: joinMerchant, isPending: joinPending } = useJoinMerchant(id);
  const { mutate: leaveMerchant, isPending: leavePending } = useLeaveMerchant(id);
  const { mutate: blockMerchant, isPending: blockPending } = useBlockMerchant(id);
  const { mutate: reportMerchant, isPending: reportPending } = useReportMerchant(id);

  const stores = useMemo(() => withDistances(merchant?.stores, userLocation), [merchant?.stores, userLocation]);
  const openStatus = useMemo(() => getOpenStatus(merchant?.openingHours), [merchant?.openingHours]);
  const loyalty = useMerchantLoyalty(merchant);

  // Keyed on the route id so they run alongside the merchant request instead of after it.
  // Guests only see the deal count from the merchant payload; once the merchant is known,
  // skip the request when it has no deal.
  const { data: deals } = useMerchantDeals(id, isAuthenticated && validId && (!merchant || merchant.activeDealCount !== 0));
  // Carries the client's own progress, so signed-in clients only; skipped when the merchant has no collection.
  const { data: collection } = useMerchantCollection(id, isAuthenticated && validId && (!merchant || merchant.hasCollection !== false));

  const galleryCount = merchant?.gallery?.length ?? 0;
  const hasDealsTab = !!deals?.length || (!isAuthenticated && !!merchant?.activeDealCount);
  const tabs = useMemo(() => getFicheTabs({ hasDeals: hasDealsTab, photoCount: galleryCount }), [hasDealsTab, galleryCount]);
  const [tab, setTab] = useState<FicheTab>(initialTab === 'loyalty' ? 'loyalty' : 'shop');
  const activeTab = tabs.includes(tab) ? tab : 'shop';

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

  // Guests can browse the profile; card, report and block actions need an account.
  // The page (and the Join the guest tapped) comes back once signed in.
  const showLoginPrompt = usePromptLogin();
  const promptLogin = useCallback((wantsJoin = false) => {
    const name = merchant?.nomBoutique ?? '';
    showLoginPrompt({
      remember: () => { if (validId) savePendingMerchant(id, wantsJoin); },
      ...(wantsJoin && name ? { title: t('guest.joinTitle', { name }), message: t('guest.joinDesc', { name }) } : {}),
    });
  }, [showLoginPrompt, t, merchant?.nomBoutique, id, validId]);
  // For props called with their own arguments (they must not read as a Join).
  const promptLoginOnly = useCallback(() => promptLogin(), [promptLogin]);

  const handleJoin = useCallback(() => {
    if (!isAuthenticated) { promptLogin(true); return; }
    if (!id || joinPending) return;
    joinMerchant(undefined, {
      onSuccess: (res) => {
        hapticSuccess();
        const granted = res.card?.welcomeBonusGranted ?? 0;
        if (granted > 0) setWelcomeGift(granted);
      },
      onError: (e) => {
        if (__DEV__) console.warn('Join merchant error:', e);
        Alert.alert(t('common.error'), t('merchant.joinError'));
      },
    });
  }, [id, isAuthenticated, joinPending, promptLogin, joinMerchant, t]);

  // Join tapped as a guest: done as soon as the page is back after sign-up.
  // The intent comes from memory (pendingDeal), never from a route param that
  // an external link could carry.
  const autoJoinedRef = useRef(false);
  const wantsAutoJoinRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (autoJoinedRef.current || !isAuthenticated || !merchant || !validId) return;
    if (wantsAutoJoinRef.current === null) wantsAutoJoinRef.current = takePendingAutoJoin(id);
    if (!wantsAutoJoinRef.current) return;
    autoJoinedRef.current = true;
    if (!merchant.hasCard || merchant.cardDeactivated) void handleJoin();
  }, [id, validId, isAuthenticated, merchant, handleJoin]);

  const closeWelcomeGift = useCallback(() => setWelcomeGift(0), []);
  const viewWelcomeCard = useCallback(() => {
    setWelcomeGift(0);
    selectTab('loyalty');
  }, [selectTab]);

  const handleLeave = useCallback(() => {
    if (!id || !merchant) return;
    const warning = t('merchant.leaveStampsWarning', { count: merchant.cardBalance ?? 0 });
    Alert.alert(t('merchant.leaveTitle'), `${warning}\n\n${t('merchant.leaveMessage')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchant.leaveConfirm'),
        style: 'destructive',
        onPress: () => {
          if (leavePending) return;
          leaveMerchant(undefined, {
            onSuccess: () => haptic(),
            onError: (e) => {
              if (__DEV__) console.warn('Leave merchant error:', e);
              Alert.alert(t('common.error'), t('merchant.leaveError'));
            },
          });
        },
      },
    ]);
  }, [id, merchant, leavePending, leaveMerchant, t]);

  const submitReport = useCallback((reason: MerchantReportReason) => {
    if (!id || reportPending) return;
    reportMerchant(reason, {
      onSuccess: () => {
        haptic();
        Alert.alert(t('merchant.reportThanksTitle'), t('merchant.reportThanksBody'));
      },
      onError: (e) => {
        if (__DEV__) console.warn('Report merchant error:', e);
        Alert.alert(t('common.error'), t('merchant.reportError'));
      },
    });
  }, [id, reportPending, reportMerchant, t]);

  // Opened from a link on a cold start there is nothing to go back to.
  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  // Apple 1.2: blocking hides the merchant everywhere, then leaves the page.
  const handleBlock = useCallback(() => {
    if (!id) return;
    Alert.alert(t('merchant.blockTitle'), t('merchant.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchant.blockConfirm'),
        style: 'destructive',
        onPress: () => {
          if (blockPending) return;
          // The cache refresh (lists, deal feeds, booking search) is in the mutation.
          blockMerchant(undefined, {
            onSuccess: () => {
              haptic();
              Alert.alert(t('merchant.blockedTitle'), t('merchant.blockedBody'), [
                { text: t('common.ok'), onPress: handleBack },
              ]);
            },
            onError: (e) => {
              if (__DEV__) console.warn('Block merchant error:', e);
              Alert.alert(t('common.error'), t('merchant.blockError'));
            },
          });
        },
      },
    ], { cancelable: true });
  }, [id, blockPending, blockMerchant, handleBack, t]);

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

  const openMore = useCallback(() => {
    if (!isAuthenticated) { promptLogin(); return; }
    setSheet('more');
    setSheetOpen(true);
  }, [isAuthenticated, promptLogin]);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const sheetOptions = useMemo<ActionSheetOption[]>(() => {
    if (sheet === 'report') {
      return REPORT_REASONS.map(({ reason, labelKey }) => ({
        key: reason, label: t(labelKey), onPress: () => { void submitReport(reason); },
      }));
    }
    return [
      // Leaving the card is on the bottom bar, next to the member badge.
      { key: 'report', label: t('merchant.reportTitle'), icon: Flag, keepOpen: true, onPress: () => setSheet('report') },
      { key: 'block', label: t('merchant.blockTitle'), icon: Ban, destructive: true, onPress: handleBlock },
    ];
  }, [sheet, t, submitReport, handleBlock]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Skeleton width="100%" height={HERO_HEIGHT} borderRadius={0} />
        <View style={styles.skeletonBody}>
          <Skeleton width={ms(90)} height={ms(90)} borderRadius={radius.lg} style={styles.skeletonLogo} />
          <Skeleton width={wp(200)} height={hp(24)} borderRadius={radius.sm} />
          <Skeleton width={wp(150)} height={hp(14)} borderRadius={radius.sm} />
          <Skeleton width={wp(260)} height={ms(44)} borderRadius={radius.full} />
          <Skeleton width="100%" height={hp(140)} borderRadius={radius.lg} />
          <Skeleton width="100%" height={hp(100)} borderRadius={radius.lg} />
        </View>
      </View>
    );
  }

  if (!merchant || !loyalty) {
    const notFound = !error || isNotFoundError(error);
    const back = { label: t('common.back'), onPress: handleBack };
    return (
      <DetailErrorState
        title={notFound ? t('merchant.notFound') : t('common.error')}
        message={notFound ? t('merchant.notFoundDesc') : t('errors.generic')}
        actions={notFound ? [back] : [{ label: t('common.retry'), onPress: () => { void refetch(); } }, { ...back, secondary: true }]}
      />
    );
  }

  const accent = getMerchantAccent(merchant.themeColor);
  const wheel = merchant.activeLuckyWheel;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
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
          style={[styles.tabs, { backgroundColor: theme.bg, borderBottomColor: theme.border }, tabsMotion]}
        >
          <MerchantTabs tabs={tabs} active={activeTab} onChange={selectTab} />
        </Animated.View>

        {/* Tall enough for the tab bar to pin even when the active tab is short. */}
        <View style={[styles.sections, { minHeight: windowHeight - pinOffset - TAB_BAR_HEIGHT }]}>
          {/* What the merchant says about the shop, laid out like a maps listing. */}
          {activeTab === 'shop' && (
            <>
              <MerchantAbout merchant={merchant} part="description" />
              <MerchantShopInfo stores={stores} hours={merchant.openingHours} merchantName={merchant.nomBoutique} />
              <MerchantAbout merchant={merchant} part="details" />
            </>
          )}
          {/* The loyalty program and its games. */}
          {activeTab === 'loyalty' && (
            <>
              <MerchantLoyaltyCard loyalty={loyalty} accent={accent} />
              {collection && <MerchantCollection collection={collection} accent={accent} />}
              {wheel && <MerchantLuckyWheel wheel={wheel} currency={merchant.currency} />}
            </>
          )}
          {activeTab === 'deals' && (
            <MerchantDeals
              deals={deals}
              activeDealCount={merchant.activeDealCount}
              isAuthenticated={isAuthenticated}
              onLocked={promptLoginOnly}
            />
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
        joinLoading={joinPending}
        leaveLoading={leavePending}
        onJoin={handleJoin}
        onLeave={handleLeave}
      />

      <ActionSheet
        visible={sheetOpen}
        title={sheet === 'report' ? t('merchant.reportTitle') : merchant.nomBoutique}
        message={sheet === 'report' ? t('merchant.reportBody') : undefined}
        options={sheetOptions}
        cancelLabel={t('common.cancel')}
        onClose={closeSheet}
      />
      <WelcomeGiftSheet
        stamps={welcomeGift}
        merchantName={merchant.nomBoutique}
        loyalty={loyalty}
        accent={accent}
        bottomInset={insets.bottom}
        onClose={closeWelcomeGift}
        onViewCard={viewWelcomeCard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: {
    marginTop: hp(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    // Above the cards' Android elevation once pinned over them.
    ...Platform.select({ android: { elevation: 2 } }),
  },
  sections: { paddingHorizontal: wp(16) },

  skeletonBody: { alignItems: 'flex-start', paddingHorizontal: wp(16), gap: hp(12) },
  skeletonLogo: { marginTop: -ms(45) },
});
