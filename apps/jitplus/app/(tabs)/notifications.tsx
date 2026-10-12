import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity, Pressable, Alert, Platform, Linking,
  AppState, LayoutAnimation, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, BellRing, CheckCheck, Trash2, X, Compass, WifiOff, RotateCcw, ArrowLeftRight,
} from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { haptic, hapticSuccess, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClientNotification } from '@/types';
import FadeInView from '@/components/FadeInView';
import GuestGuard from '@/components/GuestGuard';
import Skeleton from '@/components/Skeleton';
import { wp, hp, ms } from '@/utils/responsive';
import { useAppFonts } from '@/utils/fonts';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import {
  useNotifications, useUnreadNotificationCount,
  useMarkNotificationAsRead, useMarkAllNotificationsAsRead,
  useDismissNotification, useDismissAllNotifications,
} from '@/hooks/useQueryHooks';
import { api } from '@/services/api';
import { STAGGER_DELAY_MS, MAX_STAGGER_DELAY_MS } from '@/constants';
import {
  getNotifSection, getRelativeAge, groupNotificationsBySection,
  type NotifListItem, type NotifSection,
} from '@/utils/notificationTime';
import {
  notificationStyles as styles,
  NotificationCard,
  NotificationDetailModal,
} from '@/components/notifications';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

type Filter = 'all' | 'unread';
type ListItem = NotifListItem<ClientNotification>;

const LOCALE_TAGS: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
const SECTION_LABEL_KEYS: Record<NotifSection, string> = {
  today: 'notifications.sectionToday',
  yesterday: 'notifications.sectionYesterday',
  thisWeek: 'notifications.sectionThisWeek',
  earlier: 'notifications.sectionEarlier',
};
const SCROLLED_THRESHOLD = 4;
const NOW_TICK_MS = 60_000;
const STAGGERED_ITEMS = 6;

function getDateFormatters(locale: string) {
  const tag = LOCALE_TAGS[locale] || 'fr-FR';
  return {
    time: new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }),
    weekday: new Intl.DateTimeFormat(tag, { weekday: 'long' }),
    dayMonth: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short' }),
    dayMonthYear: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' }),
    full: new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
  };
}

function smoothLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const accent = isDark ? palette.violetLight : palette.violet;
  // useAppFonts returns a fresh object each render; stabilise it so memoised cards don't re-render.
  const { regular, medium, semibold, bold } = useAppFonts();
  const fonts = useMemo(() => ({ regular, medium, semibold, bold }), [regular, medium, semibold, bold]);
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { client, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const fmts = useMemo(() => getDateFormatters(locale), [locale]);

  const [filter, setFilter] = useState<Filter>('all');
  const [isScrolled, setIsScrolled] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [selectedNotif, setSelectedNotif] = useState<ClientNotification | null>(null);

  // ── Push permission ──
  const [pushPermission, setPushPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [bannerDismissed, setBannerDismissed] = useState(false);
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
    checkPushPermission();
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    // Coming back from the OS settings screen doesn't re-focus the tab.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { checkPushPermission(); setNow(new Date()); }
    });
    return () => { clearInterval(tick); sub.remove(); };
  }, [checkPushPermission]));

  const handleOpenSettings = useCallback(async () => {
    haptic();
    try {
      if (Platform.OS === 'ios') await Linking.openURL('app-settings:');
      else await Linking.openSettings();
    } catch { /* settings unavailable */ }
  }, []);

  const handleRequestPermission = useCallback(async () => {
    haptic();
    if (isExpoGo) { handleOpenSettings(); return; }
    try {
      const Notifs = require('expo-notifications');
      const { status } = await Notifs.requestPermissionsAsync();
      if (status === 'granted') {
        setPushPermission('granted');
        hapticSuccess();
        const { registerForPushNotifications } = require('@/utils/notifications');
        const pushToken = await registerForPushNotifications();
        if (pushToken) await api.updatePushToken(pushToken);
      } else { handleOpenSettings(); }
    } catch { handleOpenSettings(); }
  }, [isExpoGo, handleOpenSettings]);

  const handleDismissBanner = useCallback(() => { haptic(); smoothLayout(); setBannerDismissed(true); }, []);
  const showPushBanner = pushPermission === 'denied' && !bannerDismissed;

  // ── Data ──
  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useNotifications(!!client);
  const { data: unreadData } = useUnreadNotificationCount(!!client);
  const unreadCount = unreadData?.unreadCount ?? 0;

  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const dismissOne = useDismissNotification();
  const dismissAll = useDismissAllNotifications();

  const notifications = useMemo(() => data?.pages?.flatMap((p) => p?.notifications ?? []) ?? [], [data]);
  const hasAny = notifications.length > 0;

  const selectedId = selectedNotif?.id;
  const visible = useMemo(() => (
    filter === 'unread'
      // The open notification stays in the "unread" list until the sheet closes,
      // otherwise it would vanish behind the sheet the moment it's marked read.
      ? notifications.filter((n) => !n.isRead || n.id === selectedId)
      : notifications
  ), [notifications, filter, selectedId]);

  const items = useMemo(() => groupNotificationsBySection(visible, now), [visible, now]);

  // Unread items may live on pages that aren't loaded yet.
  useEffect(() => {
    if (filter === 'unread' && visible.length === 0 && unreadCount > 0 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [filter, visible.length, unreadCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Actions ──
  // Local flag so background refetches (after mark-as-read, WS pushes, next page)
  // don't flash the pull-to-refresh spinner.
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const handleRefresh = useGuardedCallback(async () => {
    haptic();
    setIsPullRefreshing(true);
    setNow(new Date());
    try {
      await Promise.all([refetch(), checkPushPermission()]);
    } finally {
      setIsPullRefreshing(false);
    }
  }, [refetch, checkPushPermission]);

  const handleOpenNotif = useCallback((notif: ClientNotification) => {
    haptic();
    if (!notif.isRead) markAsRead.mutate(notif.id);
    setSelectedNotif(notif);
  }, [markAsRead]);

  const handleCloseModal = useCallback(() => setSelectedNotif(null), []);

  const handleSwipeDismiss = useCallback((id: string) => { dismissOne.mutate(id); }, [dismissOne]);

  const handleModalDelete = useCallback((id: string) => {
    haptic(HapticStyle.Medium);
    smoothLayout();
    dismissOne.mutate(id);
  }, [dismissOne]);

  const handleMarkAllAsRead = useCallback(() => {
    hapticSuccess();
    smoothLayout();
    markAllAsRead.mutate();
  }, [markAllAsRead]);

  const handleDismissAll = useCallback(() => {
    haptic(HapticStyle.Medium);
    Alert.alert(t('notifications.deleteAllTitle'), t('notifications.deleteAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => { haptic(HapticStyle.Heavy); smoothLayout(); setFilter('all'); dismissAll.mutate(); },
      },
    ]);
  }, [dismissAll, t]);

  const handleFilterChange = useCallback((next: Filter) => {
    if (next === filter) return;
    haptic();
    smoothLayout();
    setFilter(next);
  }, [filter]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolled = e.nativeEvent.contentOffset.y > SCROLLED_THRESHOLD;
    setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
  }, []);

  // ── Formatting ──
  const formatTimeLabel = useCallback((iso: string) => {
    const date = new Date(iso);
    const section = getNotifSection(date, now);
    if (section === 'today') {
      const age = getRelativeAge(date, now);
      if (age.unit === 'now') return t('notifications.justNow');
      if (age.unit === 'minutes') return t('notifications.minutesAgo', { count: age.value });
      return t('notifications.hoursAgo', { count: age.value });
    }
    if (section === 'yesterday') return fmts.time.format(date);
    if (section === 'thisWeek') return fmts.weekday.format(date);
    return date.getFullYear() === now.getFullYear() ? fmts.dayMonth.format(date) : fmts.dayMonthYear.format(date);
  }, [now, fmts, t]);

  const formatFullDate = useCallback((date: Date) => fmts.full.format(date), [fmts]);

  // ── Rendering ──
  const staggerCacheRef = useRef<Map<string, number>>(new Map());

  const renderItem = useCallback(({ item, index }: { item: ListItem; index: number }) => {
    if (item.kind === 'header') {
      return (
        <Text
          style={[styles.sectionHeader, { color: theme.textMuted, fontFamily: fonts.semibold }, index === 0 && { marginTop: hp(6) }]}
          accessibilityRole="header"
        >
          {t(SECTION_LABEL_KEYS[item.section])}
        </Text>
      );
    }
    const { notif } = item;
    if (!staggerCacheRef.current.has(notif.id)) {
      staggerCacheRef.current.set(
        notif.id,
        index < STAGGERED_ITEMS ? Math.min(index * STAGGER_DELAY_MS, MAX_STAGGER_DELAY_MS) : 0,
      );
    }
    return (
      <FadeInView delay={staggerCacheRef.current.get(notif.id)!} duration={350} distance={hp(10)}>
        <NotificationCard
          notif={notif}
          timeLabel={formatTimeLabel(notif.createdAt)}
          onPress={handleOpenNotif}
          onDismiss={handleSwipeDismiss}
          theme={theme}
          fonts={fonts}
          t={t}
        />
      </FadeInView>
    );
  }, [theme, fonts, t, formatTimeLabel, handleOpenNotif, handleSwipeDismiss]);

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  const pushBanner = showPushBanner ? (
    <FadeInView delay={80} duration={350} distance={hp(8)}>
      <View style={[styles.pushBanner, { backgroundColor: isDark ? '#2A2113' : palette.goldUltraLight, borderColor: `${palette.gold}40` }]}>
        <View style={[styles.pushBannerIcon, { backgroundColor: `${palette.gold}22` }]}>
          <BellRing size={ms(20)} color={palette.goldDark} strokeWidth={2} />
        </View>
        <View style={styles.pushBannerTextWrap}>
          <Text style={[styles.pushBannerTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('notifications.enableTitle')}</Text>
          <Text style={[styles.pushBannerText, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('notifications.enableMessage')}</Text>
          <View style={styles.pushBannerActions}>
            <TouchableOpacity
              onPress={handleRequestPermission}
              activeOpacity={0.85}
              style={[styles.pushBannerBtn, { backgroundColor: palette.goldDark }]}
              accessibilityRole="button"
            >
              <Bell size={ms(13)} color="#fff" strokeWidth={2.2} />
              <Text style={[styles.pushBannerBtnText, { fontFamily: fonts.bold }]}>{t('notifications.enableShort')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDismissBanner} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.pushBannerLater, { color: theme.textMuted, fontFamily: fonts.semibold }]}>{t('notifications.later')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleDismissBanner}
          hitSlop={10}
          style={{ alignSelf: 'flex-start' }}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <X size={ms(16)} color={theme.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </FadeInView>
  ) : null;

  const loadingSkeleton = (
    <View style={{ paddingHorizontal: wp(16), paddingTop: hp(14) }}>
      <Skeleton width={wp(80)} height={ms(11)} borderRadius={5} style={{ marginBottom: hp(10), marginHorizontal: wp(4) }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.skeletonCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Skeleton width={ms(46)} height={ms(46)} borderRadius={ms(14)} />
          <View style={{ flex: 1, gap: hp(7) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width="38%" height={ms(11)} borderRadius={5} />
              <Skeleton width="16%" height={ms(11)} borderRadius={5} />
            </View>
            <Skeleton width="75%" height={ms(15)} borderRadius={6} />
            <Skeleton width="92%" height={ms(12)} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  );

  const listEmpty = useMemo(() => {
    if (isLoading) return null;

    if (isError && !hasAny) {
      return (
        <FadeInView delay={60} style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: `${theme.danger}14` }]}>
            <WifiOff size={ms(34)} color={theme.danger} strokeWidth={1.6} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('notifications.loadErrorTitle')}</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('notifications.loadErrorHint')}</Text>
          <TouchableOpacity
            onPress={() => { haptic(); refetch(); }}
            activeOpacity={0.85}
            style={[styles.emptyBtn, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <RotateCcw size={ms(16)} color={theme.text} strokeWidth={2} />
            <Text style={[styles.emptyBtnText, { color: theme.text, fontFamily: fonts.semibold }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </FadeInView>
      );
    }

    if (filter === 'unread' && hasAny) {
      return (
        <FadeInView delay={60} style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: `${palette.emerald}16` }]}>
            <CheckCheck size={ms(34)} color={palette.emerald} strokeWidth={1.8} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('notifications.noUnread')}</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('notifications.noUnreadHint')}</Text>
          <TouchableOpacity
            onPress={() => handleFilterChange('all')}
            activeOpacity={0.85}
            style={[styles.emptyBtn, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.emptyBtnText, { color: theme.text, fontFamily: fonts.semibold }]}>{t('notifications.showAll')}</Text>
          </TouchableOpacity>
        </FadeInView>
      );
    }

    const needsPush = pushPermission === 'denied';
    return (
      <FadeInView delay={60} style={styles.emptyWrap}>
        <View style={[styles.emptyIcon, { backgroundColor: `${palette.violet}12` }]}>
          <Bell size={ms(34)} color={accent} strokeWidth={1.6} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('notifications.noNotifications')}</Text>
        <Text style={[styles.emptyHint, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('notifications.noNotificationsHint')}</Text>
        <TouchableOpacity
          onPress={needsPush ? handleRequestPermission : () => { haptic(); router.push('/(tabs)/discover'); }}
          activeOpacity={0.85}
          style={[styles.emptyBtn, { backgroundColor: palette.violet }]}
          accessibilityRole="button"
        >
          {needsPush
            ? <BellRing size={ms(16)} color="#fff" strokeWidth={2} />
            : <Compass size={ms(16)} color="#fff" strokeWidth={2} />}
          <Text style={[styles.emptyBtnText, { color: '#fff', fontFamily: fonts.bold }]}>
            {needsPush ? t('notifications.enableButton') : t('home.discoverCta')}
          </Text>
        </TouchableOpacity>
      </FadeInView>
    );
  }, [isLoading, isError, hasAny, filter, pushPermission, theme, fonts, accent, t, refetch, handleFilterChange, handleRequestPermission, router]);

  const listFooter = (
    <>
      {isFetchingNextPage && (
        <View style={styles.footerLoader}>
          <Skeleton width={wp(160)} height={ms(12)} borderRadius={6} />
        </View>
      )}
      {!isFetchingNextPage && !hasNextPage && visible.length > 0 && (
        <View style={styles.swipeHint}>
          <ArrowLeftRight size={ms(12)} color={theme.textMuted} strokeWidth={2} />
          <Text style={[styles.swipeHintText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('notifications.swipeHint')}</Text>
        </View>
      )}
      <View style={{ height: hp(130) + insets.bottom }} />
    </>
  );

  if (isGuest) return <GuestGuard />;

  const subtitle = !hasAny
    ? null
    : unreadCount > 0
      ? t('notifications.unreadCount', { count: unreadCount })
      : t('notifications.allCaughtUp');

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
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
              {t('notifications.title')}
            </Text>
            {subtitle && (
              <Text
                style={[styles.subtitle, { color: unreadCount > 0 ? accent : theme.textMuted, fontFamily: fonts.medium }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={[styles.headerPill, { backgroundColor: `${palette.violet}${isDark ? '2E' : '14'}` }]}
              onPress={handleMarkAllAsRead}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.markAllRead')}
            >
              <CheckCheck size={ms(15)} color={accent} strokeWidth={2.2} />
              <Text style={[styles.headerPillText, { color: accent, fontFamily: fonts.bold }]} numberOfLines={1}>
                {t('notifications.markAllReadShort')}
              </Text>
            </TouchableOpacity>
          )}
          {hasAny && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={handleDismissAll}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.deleteAll')}
            >
              <Trash2 size={ms(17)} color={theme.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        {hasAny && (
          <View style={styles.filterRow} accessibilityRole="tablist">
            {(['all', 'unread'] as const).map((key) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => handleFilterChange(key)}
                  style={[
                    styles.filterChip,
                    active
                      ? { backgroundColor: theme.text, borderColor: theme.text }
                      : { backgroundColor: theme.bgCard, borderColor: theme.border },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterChipText, { color: active ? theme.bg : theme.text, fontFamily: fonts.semibold }]}>
                    {t(key === 'all' ? 'notifications.filterAll' : 'notifications.filterUnread')}
                  </Text>
                  {key === 'unread' && unreadCount > 0 && (
                    <View style={[styles.filterBadge, { backgroundColor: palette.violet }]}>
                      <Text style={[styles.filterBadgeText, { fontFamily: fonts.bold }]}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {isLoading ? loadingSkeleton : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={pushBanner}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          refreshControl={
            <RefreshControl refreshing={isPullRefreshing} onRefresh={handleRefresh}
              tintColor={theme.primaryLight} colors={[theme.primary]} progressBackgroundColor={theme.bgCard} />
          }
          onScroll={handleScroll}
          scrollEventThrottle={32}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={12}
        />
      )}

      <NotificationDetailModal
        notif={selectedNotif}
        onClose={handleCloseModal}
        onDelete={handleModalDelete}
        theme={theme}
        fonts={fonts}
        formatDate={formatFullDate}
        t={t}
      />
    </View>
  );
}
