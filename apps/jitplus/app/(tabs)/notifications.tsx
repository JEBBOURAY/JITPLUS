import { useCallback, useMemo, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Alert, Platform, Linking, Image,
  Modal, ScrollView, Animated, PanResponder, Dimensions,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BellOff, Trash2, CheckCheck, CircleDot, BellRing, X, Settings,
} from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { haptic } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClientNotification } from '@/types';
import FadeInView from '@/components/FadeInView';
import GuestGuard from '@/components/GuestGuard';
import Skeleton from '@/components/Skeleton';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useDismissNotification,
  useDismissAllNotifications,
  queryKeys,
} from '@/hooks/useQueryHooks';
import MerchantLogo from '@/components/MerchantLogo';

// Locale-aware date formatter — creates a new one only when locale changes
function getNotifDateFmt(locale: string) {
  const localeMap: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-SA' };
  return new Intl.DateTimeFormat(localeMap[locale] || 'fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const COLOR_MAP: Record<string, string> = {
  reward: '#10B981',
  promo: palette.violet,
  info: '#F59E0B',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

// ── Swipeable wrapper for notification cards ──
function SwipeableNotifCard({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy * 2),
      onPanResponderMove: (_, gesture) => {
        translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
          const toValue = gesture.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
          Animated.timing(translateX, {
            toValue,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            Animated.timing(rowHeight, {
              toValue: 0,
              duration: 180,
              useNativeDriver: false,
            }).start(onDismiss);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
    }),
  ).current;

  const opacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, SCREEN_WIDTH],
    outputRange: [0.2, 0.7, 1, 0.7, 0.2],
    extrapolate: 'clamp',
  });

  const swipeBgOpacity = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -20, 0, 20, SWIPE_THRESHOLD],
    outputRange: [1, 0.6, 0, 0.6, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={{
        maxHeight: rowHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }),
        opacity: rowHeight,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[styles.swipeBackground, { opacity: swipeBgOpacity }]}>
        <View style={styles.swipeAction}>
          <Trash2 size={ms(20)} color="#fff" strokeWidth={1.5} />
        </View>
        <View style={styles.swipeAction}>
          <Trash2 size={ms(20)} color="#fff" strokeWidth={1.5} />
        </View>
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }], opacity }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const notifDateFmt = useMemo(() => getNotifDateFmt(locale), [locale]);
  const { client, isGuest } = useAuth();
  const insets = useSafeAreaInsets();

  // ── Push permission banner ──
  const [pushPermission, setPushPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<ClientNotification | null>(null);
  const queryClient = useQueryClient();

  const isExpoGo = Constants.appOwnership === 'expo';

  const checkPushPermission = useCallback(async () => {
    if (isExpoGo) { setPushPermission('unknown'); return; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifs = require('expo-notifications');
      const { status } = await Notifs.getPermissionsAsync();
      setPushPermission(status === 'granted' ? 'granted' : 'denied');
    } catch {
      setPushPermission('unknown');
    }
  }, [isExpoGo]);

  // Check each time the screen is focused + ensure fresh notifications
  useFocusEffect(useCallback(() => {
    setBannerDismissed(false);
    checkPushPermission();
    // Invalidate to guarantee fresh data when user navigates to this tab
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
  }, [checkPushPermission, queryClient]));

  const handleOpenSettings = useCallback(async () => {
    haptic();
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  }, []);

  const handleRequestPermission = useCallback(async () => {
    haptic();
    if (isExpoGo) { handleOpenSettings(); return; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifs = require('expo-notifications');
      const { status } = await Notifs.requestPermissionsAsync();
      if (status === 'granted') {
        setPushPermission('granted');
        // Register push token now that permission is granted
        const { registerForPushNotifications } = require('@/utils/notifications');
        const { api } = require('@/services/api');
        const pushToken = await registerForPushNotifications();
        if (pushToken) {
          await api.updatePushToken(pushToken);
        }
      } else {
        // If denied, must go to settings
        handleOpenSettings();
      }
    } catch {
      handleOpenSettings();
    }
  }, [isExpoGo, handleOpenSettings]);

  const showPushBanner = pushPermission === 'denied' && !bannerDismissed;

  // ── React Query ──
  const {
    data,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications(!!client);

  const { data: unreadData } = useUnreadNotificationCount(!!client);
  const unreadCount = unreadData?.unreadCount ?? 0;

  // ── Mutations ──
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const dismissOne = useDismissNotification();
  const dismissAll = useDismissAllNotifications();

  const notifications = useMemo(
    () => data?.pages.flatMap((p) => p.notifications) ?? [],
    [data],
  );

  // ── Handlers ──
  const handleRefresh = useGuardedCallback(async () => {
    haptic();
    await refetch();
  }, [refetch]);

  const handleTapNotification = useCallback((notif: ClientNotification) => {
    haptic();
    if (!notif.isRead) markAsRead.mutate(notif.id);
    setSelectedNotif(notif);
  }, [markAsRead]);

  const handleDismiss = useCallback((notifId: string) => {
    haptic();
    dismissOne.mutate(notifId);
  }, [dismissOne]);

  const handleMarkAllAsRead = useCallback(() => {
    haptic();
    markAllAsRead.mutate();
  }, [markAllAsRead]);

  const handleDismissAll = useCallback(() => {
    Alert.alert(
      t('notifications.deleteAllTitle'),
      t('notifications.deleteAllMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            haptic();
            dismissAll.mutate();
          },
        },
      ],
    );
  }, [dismissAll, t]);

  // ── Skeleton ──
  const loadingSkeleton = useMemo(() => (
    <View style={{ paddingHorizontal: wp(20), paddingTop: insets.top + hp(12), gap: hp(10) }}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.notifCard, { backgroundColor: theme.bgCard }]}>
          <Skeleton width={ms(42)} height={ms(42)} borderRadius={ms(14)} />
          <View style={{ flex: 1, gap: hp(6) }}>
            <Skeleton width={wp(140)} height={ms(16)} borderRadius={6} />
            <Skeleton width={wp(220)} height={ms(14)} borderRadius={6} />
            <Skeleton width={wp(100)} height={ms(12)} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  ), [theme.bgCard, insets.top]);

  // ── Header with action buttons ──
  const ListHeader = useMemo(() => {
    if (notifications.length === 0) return null;
    return (
      <View style={styles.actionsRow}>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: `${palette.violet}12` }]}
            onPress={handleMarkAllAsRead}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.readAll', { count: unreadCount })}
          >
            <CheckCheck size={ms(14)} color={palette.violet} strokeWidth={1.5} />
            <Text style={[styles.actionBtnText, { color: palette.violet }]}>
              {t('notifications.readAll', { count: unreadCount })}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#EF444412' }]}
          onPress={handleDismissAll}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.deleteAll')}
        >
          <Trash2 size={ms(14)} color="#EF4444" strokeWidth={1.5} />
          <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>{t('notifications.deleteAll')}</Text>
        </TouchableOpacity>
      </View>
    );
  }, [notifications.length, unreadCount, handleMarkAllAsRead, handleDismissAll, t]);

  // ── Render notification card ──
  const renderNotif = useCallback(({ item: notif, index }: { item: ClientNotification; index: number }) => {
    const color = COLOR_MAP[notif.type] || theme.primary;
    const isUnread = !notif.isRead;
    // Cap animation delay to avoid stacking 1200ms+ of stagger for long lists
    const animDelay = Math.min(index * 60, 300);

    return (
      <FadeInView key={notif.id} delay={animDelay}>
        <SwipeableNotifCard onDismiss={() => handleDismiss(notif.id)}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => handleTapNotification(notif)}
            style={[
              styles.notifCard,
              {
                backgroundColor: theme.bgCard,
                borderLeftColor: isUnread ? palette.violet : 'transparent',
                borderLeftWidth: isUnread ? ms(3) : 0,
              },
            ]}
          >
            {/* Unread indicator dot */}
            {isUnread && (
              <View style={styles.unreadDot}>
                <CircleDot size={ms(8)} color={palette.violet} fill={palette.violet} />
              </View>
            )}

            <View style={[styles.notifIcon, { backgroundColor: `${color}15` }]}>
              <MerchantLogo logoUrl={notif.merchantLogoUrl} style={styles.notifLogoImg} />
            </View>
            <View style={styles.notifContent}>
              <Text
                style={[
                  styles.notifTitle,
                  {
                    color: theme.text,
                    fontWeight: isUnread ? '700' : '500',
                    opacity: isUnread ? 1 : 0.8,
                  },
                ]}
              >
                {notif.title}
              </Text>
              <Text style={[styles.notifBody, { color: theme.textMuted }]} numberOfLines={2}>
                {notif.body}
              </Text>
              <View style={styles.notifMeta}>
                {notif.merchantName && (
                  <Text style={[styles.notifMerchant, { color: theme.primaryLight }]}>
                    {notif.merchantName}
                  </Text>
                )}
                <Text style={[styles.notifDate, { color: theme.textMuted }]}>
                  {notifDateFmt.format(new Date(notif.createdAt))}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </SwipeableNotifCard>
      </FadeInView>
    );
  }, [theme, handleTapNotification, handleDismiss, notifDateFmt]);

  const keyExtractor = useCallback((item: ClientNotification) => item.id, []);

  // ── Notification detail modal ──
  const notifModal = useMemo(() => {
    if (!selectedNotif) return null;
    return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => setSelectedNotif(null)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setSelectedNotif(null)}
      />
      <View style={[styles.modalSheet, { backgroundColor: theme.bgCard }]}>
        {/* Handle */}
        <View style={[styles.modalHandle, { backgroundColor: theme.textMuted + '60' }]} />

        {/* Header: logo + merchant + date */}
        <View style={styles.modalHeader}>
          <View style={[styles.modalIcon, { backgroundColor: `${COLOR_MAP[selectedNotif.type] ?? theme.primary}15` }]}>
            <MerchantLogo logoUrl={selectedNotif.merchantLogoUrl} style={styles.modalLogoImg} />
          </View>
          <View style={{ flex: 1 }}>
            {selectedNotif.merchantName && (
              <Text style={[styles.modalMerchant, { color: theme.primaryLight }]}>
                {selectedNotif.merchantName}
              </Text>
            )}
            <Text style={[styles.modalDate, { color: theme.textMuted }]}>
              {notifDateFmt.format(new Date(selectedNotif.createdAt))}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setSelectedNotif(null)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: ms(4) }}
          >
            <X size={ms(20)} color={theme.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        {/* Body */}
        <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            {selectedNotif.title}
          </Text>
          <Text style={[styles.modalBodyText, { color: theme.textMuted }]}>
            {selectedNotif.body}
          </Text>
        </ScrollView>

        {/* Close button */}
        <TouchableOpacity
          style={[styles.modalCloseBtn, { backgroundColor: `${theme.primary}18` }]}
          onPress={() => setSelectedNotif(null)}
          activeOpacity={0.75}
        >
          <Text style={[styles.modalCloseBtnText, { color: theme.primary }]}>
            {t('common.close')}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
    );
  }, [selectedNotif, theme, notifDateFmt, t]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isGuest) return <GuestGuard />;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {notifModal}
      {isLoading ? loadingSkeleton : (
        <FlatList
          data={notifications}
          renderItem={renderNotif}
          keyExtractor={keyExtractor}
          style={styles.scroll}
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={10}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + hp(12) },
            notifications.length === 0 && styles.scrollContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Push permission banner */}
              {showPushBanner && (
                <FadeInView delay={100}>
                  <View style={[styles.pushBanner, { backgroundColor: `${palette.amber}12`, borderColor: `${palette.amber}35` }]}>
                    <View style={styles.pushBannerTop}>
                      <View style={[styles.pushBannerIcon, { backgroundColor: `${palette.amber}20` }]}>
                        <BellRing size={ms(20)} color={palette.amber} strokeWidth={1.5} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pushBannerTitle, { color: theme.text }]}>
                          {t('notifications.enableTitle')}
                        </Text>
                        <Text style={[styles.pushBannerText, { color: theme.textMuted }]}>
                          {t('notifications.enableMessage')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setBannerDismissed(true)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ padding: ms(4) }}
                      >
                        <X size={ms(16)} color={theme.textMuted} strokeWidth={1.5} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={handleRequestPermission}
                      activeOpacity={0.7}
                      style={[styles.pushBannerBtn, { backgroundColor: `${palette.amber}22` }]}
                    >
                      <Settings size={ms(14)} color={palette.amber} strokeWidth={1.5} />
                      <Text style={[styles.pushBannerBtnText, { color: palette.amber }]}>{t('notifications.enableButton')}</Text>
                    </TouchableOpacity>
                  </View>
                </FadeInView>
              )}
              {ListHeader}
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={theme.primaryLight}
              colors={[theme.primary]}
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              <FadeInView delay={200}>
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIcon, { backgroundColor: theme.primaryBg }]}>
                    <BellOff size={ms(36)} color={theme.textMuted} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('notifications.noNotifications')}</Text>
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    {t('notifications.noNotificationsHint')}
                  </Text>
                </View>
              </FadeInView>
            ) : null
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <Skeleton width={wp(200)} height={ms(14)} borderRadius={6} />
              </View>
            ) : <View style={styles.footerSpacer} />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Action bar
  actionsRow: {
    flexDirection: 'row',
    gap: wp(10),
    marginBottom: hp(14),
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    paddingHorizontal: wp(14),
    paddingVertical: hp(8),
    borderRadius: radius.lg,
  },
  actionBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(20) },
  scrollContentEmpty: { flexGrow: 1, justifyContent: 'center' },

  // Notification card
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(12),
    padding: wp(16), borderRadius: radius.xl, marginBottom: hp(10),
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: hp(8),
    right: wp(8),
  },
  notifIcon: {
    width: ms(42), height: ms(42), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center', marginTop: hp(2), overflow: 'hidden',
  },
  notifLogoImg: {
    width: ms(42), height: ms(42), borderRadius: ms(14),
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: fontSize.md, marginBottom: hp(4) },
  notifBody: { fontSize: fontSize.sm, lineHeight: ms(20) },
  notifMeta: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginTop: hp(6) },
  notifMerchant: { fontSize: fontSize.xs, fontWeight: '600' },
  notifDate: { fontSize: fontSize.xs },

  // Swipe-to-delete background
  swipeBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EF4444',
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(24),
    marginBottom: hp(10),
  },
  swipeAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: hp(80) },
  emptyIcon: {
    width: ms(80), height: ms(80), borderRadius: ms(40),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(20),
  },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', marginBottom: hp(8) },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(22) },

  // Push permission banner
  pushBanner: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: wp(14),
    marginBottom: hp(14),
  },

  footerLoader: { paddingVertical: hp(16), alignItems: 'center' },
  footerSpacer: { height: hp(120) },

  pushBannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wp(10),
  },
  pushBannerIcon: {
    width: ms(38),
    height: ms(38),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pushBannerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: hp(3),
  },
  pushBannerText: {
    fontSize: fontSize.xs,
    lineHeight: ms(18),
  },
  pushBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
    marginTop: hp(10),
    paddingVertical: hp(9),
    borderRadius: radius.lg,
  },
  pushBannerBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // ── Notification detail modal ──
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: radius.xl * 1.5,
    borderTopRightRadius: radius.xl * 1.5,
    paddingHorizontal: wp(24),
    paddingBottom: hp(36),
    paddingTop: hp(12),
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHandle: {
    width: wp(40), height: hp(4), borderRadius: hp(2),
    alignSelf: 'center', marginBottom: hp(20),
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14), marginBottom: hp(20),
  },
  modalIcon: {
    width: ms(52), height: ms(52), borderRadius: ms(16), overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  modalLogoImg: { width: ms(52), height: ms(52), borderRadius: ms(16) },
  modalMerchant: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: hp(3) },
  modalDate: { fontSize: fontSize.xs },
  modalBody: { marginBottom: hp(24) },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', lineHeight: ms(28), marginBottom: hp(12) },
  modalBodyText: { fontSize: fontSize.md, lineHeight: ms(26) },
  modalCloseBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: hp(14), borderRadius: radius.lg,
  },
  modalCloseBtnText: { fontSize: fontSize.md, fontWeight: '700' },
});
