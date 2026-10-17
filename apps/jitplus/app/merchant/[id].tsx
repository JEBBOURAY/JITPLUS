import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable, Share, Alert, Animated, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Redirect, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AlertCircle, Ban, Flag, LogOut } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import Skeleton from '@/components/Skeleton';
import ActionSheet, { type ActionSheetOption } from '@/components/ActionSheet';
import { useMerchantById } from '@/hooks/useQueryHooks';
import { useKnownLocation } from '@/hooks/useKnownLocation';
import { api, getServerBaseUrl } from '@/services/api';
import { haptic, hapticSuccess } from '@/utils/haptics';
import { useAppFonts } from '@/utils/fonts';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { getOpenStatus, hasOpeningHours } from '@/utils/openingHours';
import { withDistances } from '@/utils/merchantStores';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';
import {
  HERO_HEIGHT,
  MerchantHero, MerchantStickyHeader, MerchantQuickActions, MerchantLoyaltyCard,
  MerchantLuckyWheel, MerchantAbout, MerchantGallery, MerchantOpeningHours,
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

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: merchant, isLoading, error, refetch } = useMerchantById(id, isAuthenticated);
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

  const pageBg = theme.mode === 'dark' ? theme.bg : palette.gray50;

  const stores = useMemo(() => withDistances(merchant?.stores, userLocation), [merchant?.stores, userLocation]);
  const openStatus = useMemo(() => getOpenStatus(merchant?.openingHours), [merchant?.openingHours]);

  const patchMerchant = useCallback((patch: Partial<Merchant>) => {
    queryClient.setQueryData<Merchant>(['merchant', id], (m) => (m ? { ...m, ...patch } : m));
  }, [queryClient, id]);

  const refreshCards = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'stamps' || (q.queryKey[0] === 'merchant' && q.queryKey[1] === id),
    });
  }, [queryClient, id]);

  const handleJoin = useCallback(async () => {
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
  }, [id, patchMerchant, refreshCards, t]);

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
  const handleShowQr = useCallback(() => { haptic(); router.push('/(tabs)/qr'); }, [router]);
  const openMore = useCallback(() => setSheet('more'), []);
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

  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: pageBg }]}>
        <Skeleton width="100%" height={HERO_HEIGHT} borderRadius={0} />
        <View style={styles.skeletonBody}>
          <Skeleton width={ms(104)} height={ms(104)} borderRadius={ms(30)} style={styles.skeletonLogo} />
          <Skeleton width={wp(200)} height={hp(26)} borderRadius={ms(8)} />
          <Skeleton width={wp(140)} height={hp(16)} borderRadius={ms(8)} />
          <Skeleton width="100%" height={hp(64)} borderRadius={ms(18)} />
          <Skeleton width="100%" height={hp(180)} borderRadius={ms(22)} />
          <Skeleton width="100%" height={hp(120)} borderRadius={ms(22)} />
        </View>
      </View>
    );
  }

  if (!merchant) {
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
  const gallery = merchant.gallery ?? [];

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_BAR_SPACE }}
      >
        <MerchantHero
          merchant={merchant}
          scrollY={scrollY}
          pageBg={pageBg}
          openStatus={openStatus}
          distanceKm={stores[0]?.distanceKm ?? null}
        />
        <MerchantQuickActions merchant={merchant} store={stores[0] ?? null} />

        <View style={styles.sections}>
          <MerchantLoyaltyCard merchant={merchant} />
          {merchant.activeLuckyWheel && <MerchantLuckyWheel wheel={merchant.activeLuckyWheel} />}
          <MerchantAbout merchant={merchant} />
          <MerchantGallery images={gallery} accent={accent} />
          {hasOpeningHours(merchant.openingHours) && (
            <MerchantOpeningHours hours={merchant.openingHours} status={openStatus} accent={accent} />
          )}
          <MerchantLocations stores={stores} merchantName={merchant.nomBoutique} accent={accent} />
        </View>
      </Animated.ScrollView>

      <MerchantStickyHeader
        title={merchant.nomBoutique}
        scrollY={scrollY}
        onBack={handleBack}
        onShare={handleShare}
        onMore={openMore}
      />

      <MerchantBottomBar merchant={merchant} joinLoading={joinLoading} onJoin={handleJoin} onShowQr={handleShowQr} />

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
  sections: { paddingHorizontal: wp(16), paddingTop: hp(22), gap: hp(14) },

  skeletonBody: { alignItems: 'center', paddingHorizontal: wp(16), gap: hp(14) },
  skeletonLogo: { marginTop: -ms(52) },

  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: wp(40) },
  errorIcon: { width: ms(64), height: ms(64), borderRadius: ms(22), alignItems: 'center', justifyContent: 'center', marginBottom: hp(16) },
  errorTitle: { fontSize: ms(20), marginBottom: hp(8), textAlign: 'center' },
  errorText: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(22), marginBottom: hp(24) },
  errorActions: { flexDirection: 'row', gap: wp(10) },
  errorButton: { paddingHorizontal: wp(24), paddingVertical: hp(12), borderRadius: ms(14) },
  errorButtonText: { color: '#fff', fontSize: ms(15) },
});
