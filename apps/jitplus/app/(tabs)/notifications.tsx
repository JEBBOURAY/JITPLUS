import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  View, Text, FlatList, RefreshControl,
  TouchableOpacity, Alert, Platform, Linking,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellOff, Trash2, CheckCheck, CircleDot, BellRing, X, Settings } from 'lucide-react-native';
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
import { wp, hp, ms } from '@/utils/responsive';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import {
  useNotifications, useUnreadNotificationCount,
  useMarkNotificationAsRead, useMarkAllNotificationsAsRead,
  useDismissNotification, useDismissAllNotifications,
} from '@/hooks/useQueryHooks';
import MerchantLogo from '@/components/MerchantLogo';
import { api } from '@/services/api';
import { STAGGER_DELAY_MS, MAX_STAGGER_DELAY_MS } from '@/constants';
import {
  notificationStyles as styles,
  SwipeableNotifCard,
  NotificationDetailModal,
} from '@/components/notifications';

function getNotifDateFmt(locale: string) {
  const localeMap: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-SA' };
  return new Intl.DateTimeFormat(localeMap[locale] || 'fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const COLOR_MAP: Record<string, string> = {
  reward: '#10B981', promo: palette.violet, info: '#3B82F6',
};

export default function NotificationsScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const notifDateFmt = useMemo(() => getNotifDateFmt(locale), [locale]);
  const { client, isGuest } = useAuth();
  const insets = useSafeAreaInsets();

  const [pushPermission, setPushPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<ClientNotification | null>(null);

  const isExpoGo = Constants.appOwnership === 'expo';

  const checkPushPermission = useCallback(async () => {
    if (isExpoGo) { setPushPermission('unknown'); return; }
    try {
      const Notifs = require('expo-notifications');
      const { status } = await Notifs.getPermissionsAsync();
      setPushPermission(status === 'granted' ? 'granted' : 'denied');
    } catch { setPushPermission('unknown'); }
  }, [isExpoGo]);

  useFocusEffect(useCallback(() => {
    setBannerDismissed(false);
    checkPushPermission();
  }, [checkPushPermission]));

  const handleOpenSettings = useCallback(async () => {
    haptic();
    Platform.OS === 'ios' ? await Linking.openURL('app-settings:') : await Linking.openSettings();
  }, []);

  const handleRequestPermission = useCallback(async () => {
    haptic();
    if (isExpoGo) { handleOpenSettings(); return; }
    try {
      const Notifs = require('expo-notifications');
      const { status } = await Notifs.requestPermissionsAsync();
      if (status === 'granted') {
        setPushPermission('granted');
        const { registerForPushNotifications } = require('@/utils/notifications');
        const pushToken = await registerForPushNotifications();
        if (pushToken) await api.updatePushToken(pushToken);
      } else { handleOpenSettings(); }
    } catch { handleOpenSettings(); }
  }, [isExpoGo, handleOpenSettings]);

  const showPushBanner = pushPermission === 'denied' && !bannerDismissed;

  const { data, isLoading, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(!!client);
  const { data: unreadData } = useUnreadNotificationCount(!!client);
  const unreadCount = unreadData?.unreadCount ?? 0;

  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const dismissOne = useDismissNotification();
  const dismissAll = useDismissAllNotifications();

  const notifications = useMemo(() => data?.pages?.flatMap((p) => p?.notifications ?? []) ?? [], [data]);

  const handleRefresh = useGuardedCallback(async () => { haptic(); await refetch(); }, [refetch]);
  const handleTapNotification = useCallback((notif: ClientNotification) => {
    haptic();
    if (!notif.isRead) markAsRead.mutate(notif.id);
    setSelectedNotif(notif);
  }, [markAsRead]);
  const handleDismiss = useCallback((notifId: string) => { haptic(); dismissOne.mutate(notifId); }, [dismissOne]);
  const handleCloseModal = useCallback(() => setSelectedNotif(null), []);
  const handleMarkAllAsRead = useCallback(() => { haptic(); markAllAsRead.mutate(); }, [markAllAsRead]);
  const handleDismissAll = useCallback(() => {
    Alert.alert(t('notifications.deleteAllTitle'), t('notifications.deleteAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => { haptic(); dismissAll.mutate(); } },
    ]);
  }, [dismissAll, t]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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

  const ListHeader = useMemo(() => {
    if (notifications.length === 0) return null;
    return (
      <View style={styles.actionsRow}>
        {unreadCount > 0 && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: `${palette.gold}12` }]} onPress={handleMarkAllAsRead} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('notifications.readAll', { count: unreadCount })}>
            <CheckCheck size={ms(14)} color={palette.gold} strokeWidth={1.5} />
            <Text style={[styles.actionBtnText, { color: palette.gold }]}>{t('notifications.readAll', { count: unreadCount })}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#EF444412' }]} onPress={handleDismissAll} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('notifications.deleteAll')}>
          <Trash2 size={ms(14)} color="#EF4444" strokeWidth={1.5} />
          <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>{t('notifications.deleteAll')}</Text>
        </TouchableOpacity>
      </View>
    );
  }, [notifications.length, unreadCount, handleMarkAllAsRead, handleDismissAll, t]);

  const staggerCacheRef = useRef<Map<string, number>>(new Map());
  const renderNotif = useCallback(({ item: notif, index }: { item: ClientNotification; index: number }) => {
    const color = COLOR_MAP[notif.type] || theme.primary;
    const isUnread = !notif.isRead;
    const isAdmin = !notif.merchantName;
    if (!staggerCacheRef.current.has(notif.id)) {
      staggerCacheRef.current.set(notif.id, index < 5 ? Math.min(index * STAGGER_DELAY_MS, MAX_STAGGER_DELAY_MS) : 0);
    }
    return (
      <FadeInView key={notif.id} delay={staggerCacheRef.current.get(notif.id)!}>
        <SwipeableNotifCard onDismiss={() => handleDismiss(notif.id)} dismissLabel={t('notifications.swipeToDismiss')}>
          <TouchableOpacity
            activeOpacity={0.75} onPress={() => handleTapNotification(notif)}
            style={[styles.notifCard, {
              backgroundColor: theme.bgCard,
              borderLeftColor: isUnread ? (isAdmin ? '#3B82F6' : palette.violet) : 'transparent',
              borderLeftWidth: isUnread ? ms(3) : 0,
              shadowColor: isUnread ? palette.violet : '#000',
              shadowOpacity: isUnread ? 0.08 : 0.04,
              shadowRadius: isUnread ? 12 : 8,
              elevation: isUnread ? 3 : 2,
            }]}
          >
            {isUnread && <View style={styles.unreadDot}><CircleDot size={ms(8)} color={isAdmin ? '#3B82F6' : palette.violet} fill={isAdmin ? '#3B82F6' : palette.violet} /></View>}
            <View style={[styles.notifIcon, { backgroundColor: `${color}15` }]}>
              <MerchantLogo logoUrl={notif.merchantLogoUrl} style={styles.notifLogoImg} />
            </View>
            <View style={styles.notifContent}>
              <Text style={[styles.notifTitle, { color: theme.text, fontWeight: isUnread ? '700' : '500', opacity: isUnread ? 1 : 0.8 }]}>{notif.title}</Text>
              <Text style={[styles.notifBody, { color: theme.textMuted }]} numberOfLines={2}>{notif.body}</Text>
              <View style={styles.notifMeta}>
                <Text style={[styles.notifMerchant, { color: isAdmin ? '#3B82F6' : theme.primaryLight }, isAdmin && styles.notifOfficialBadge]}>{notif.merchantName || 'JitPlus'}</Text>
                <Text style={[styles.notifDate, { color: theme.textMuted }]}>{notifDateFmt.format(new Date(notif.createdAt))}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </SwipeableNotifCard>
      </FadeInView>
    );
  }, [theme, handleTapNotification, handleDismiss, notifDateFmt, t]);

  const keyExtractor = useCallback((item: ClientNotification) => item.id, []);

  if (isGuest) return <GuestGuard />;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <NotificationDetailModal notif={selectedNotif} onClose={handleCloseModal} theme={theme} notifDateFmt={notifDateFmt} t={t} />
      {isLoading ? loadingSkeleton : (
        <FlatList
          data={notifications} renderItem={renderNotif} keyExtractor={keyExtractor}
          style={styles.scroll} removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={10} windowSize={7} initialNumToRender={10}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + hp(12) }, notifications.length === 0 && styles.scrollContentEmpty]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {showPushBanner && (
                <FadeInView delay={100}>
                  <View style={[styles.pushBanner, { backgroundColor: `${palette.gold}12`, borderColor: `${palette.gold}35` }]}>
                    <View style={styles.pushBannerTop}>
                      <View style={[styles.pushBannerIcon, { backgroundColor: `${palette.gold}20` }]}>
                        <BellRing size={ms(20)} color={palette.gold} strokeWidth={1.5} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pushBannerTitle, { color: theme.text }]}>{t('notifications.enableTitle')}</Text>
                        <Text style={[styles.pushBannerText, { color: theme.textMuted }]}>{t('notifications.enableMessage')}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setBannerDismissed(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: ms(4) }}>
                        <X size={ms(16)} color={theme.textMuted} strokeWidth={1.5} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={handleRequestPermission} activeOpacity={0.7} style={[styles.pushBannerBtn, { backgroundColor: `${palette.gold}22` }]}>
                      <Settings size={ms(14)} color={palette.gold} strokeWidth={1.5} />
                      <Text style={[styles.pushBannerBtnText, { color: palette.gold }]}>{t('notifications.enableButton')}</Text>
                    </TouchableOpacity>
                  </View>
                </FadeInView>
              )}
              {ListHeader}
            </>
          }
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={theme.primaryLight} colors={[theme.primary]} />}
          ListEmptyComponent={!isLoading ? (
            <FadeInView delay={200}>
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: `${palette.gold}15` }]}>
                  <BellOff size={ms(36)} color={palette.gold} strokeWidth={1.5} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('notifications.noNotifications')}</Text>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('notifications.noNotificationsHint')}</Text>
              </View>
            </FadeInView>
          ) : null}
          ListFooterComponent={isFetchingNextPage ? <View style={styles.footerLoader}><Skeleton width={wp(200)} height={ms(14)} borderRadius={6} /></View> : <View style={styles.footerSpacer} />}
          onEndReached={handleEndReached} onEndReachedThreshold={0.4}
        />
      )}
    </View>
  );
}
