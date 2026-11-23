import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { intlLocaleTag } from '@jitplus/shared/src/currency';
import {
  View, FlatList, RefreshControl, TouchableOpacity, Pressable, Alert, Platform,
  AppState, LayoutAnimation,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, BellRing, CheckCheck, Trash2, X, Compass, ArrowLeftRight,
} from 'lucide-react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { haptic, hapticSuccess, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClientNotification } from '@/types';
import EmptyState from '@/components/EmptyState';
import FadeInView from '@/components/FadeInView';
import RetryState from '@/components/RetryState';
import { HeaderBackButton, ScreenHeader } from '@/components/ScreenHeader';
import Skeleton from '@/components/Skeleton';
import { wp, hp, ms } from '@/utils/responsive';
import { useAppFonts } from '@/utils/fonts';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { usePushPermission } from '@/hooks/usePushPermission';
import { useScrolledHeader } from '@/hooks/useScrolledHeader';
import {
  useNotifications, useUnreadNotificationCount,
  useMarkNotificationAsRead, useMarkAllNotificationsAsRead,
  useDismissNotification, useDismissAllNotifications,
} from '@/hooks/useQueryHooks';
import { STAGGER_DELAY_MS, MAX_STAGGER_DELAY_MS } from '@/constants';
import { formatBadgeCount } from '@/utils/badge';
import { notificationTapRoute } from '@/utils/notificationKind';
import { openRoute } from '@/utils/navReset';
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

const SECTION_LABEL_KEYS: Record<NotifSection, string> = {
  today: 'notifications.sectionToday',
  yesterday: 'notifications.sectionYesterday',
  thisWeek: 'notifications.sectionThisWeek',
  earlier: 'notifications.sectionEarlier',
};
const NOW_TICK_MS = 60_000;
const STAGGERED_ITEMS = 6;

function getDateFormatters(locale: string) {
  const tag = intlLocaleTag(locale);
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
  const accent = theme.primary;
  // useAppFonts returns a fresh object each render; stabilise it so memoised cards don't re-render.
  const { regular, medium, semibold, bold } = useAppFonts();
  const fonts = useMemo(() => ({ regular, medium, semibold, bold }), [regular, medium, semibold, bold]);
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { client } = useAuth();
  const insets = useSafeAreaInsets();
  const fmts = useMemo(() => getDateFormatters(locale), [locale]);

  const [filter, setFilter] = useState<Filter>('all');
  const { isScrolled, onScroll } = useScrolledHeader();
  const [now, setNow] = useState(() => new Date());
  const [selectedNotif, setSelectedNotif] = useState<ClientNotification | null>(null);

  // Opened from the bell of the cards screen (or a notification): back to where the client was.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  // ── Push permission ──
  const {
    permission: pushPermission, showBanner: showPushBanner,
    check: checkPushPermission, request: requestPushPermission, dismissBanner,
  } = usePushPermission();

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

  const handleRequestPermission = useCallback(async () => {
    haptic();
    if (await requestPushPermission()) hapticSuccess();
  }, [requestPushPermission]);

  const handleDismissBanner = useCallback(() => {
    haptic();
    smoothLayout();
    dismissBanner();
  }, [dismissBanner]);

  // ── Data ──
  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useNotifications(!!client);
  const { data: unreadData } = useUnreadNotificationCount(!!client);
  const unreadCount = unreadData?.unreadCount ?? 0;

  // `mutate` is stable; the mutation object is new on every render and broke the
  // memo of every row through renderItem's callbacks.
  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
  const { mutate: dismissOne } = useDismissNotification();
  const { mutate: dismissAll } = useDismissAllNotifications();

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
  // Follows the pull only: background refetches (mark-as-read, WS pushes, next
  // page) don't flash the spinner.
  const pull = usePullToRefresh(async () => {
    haptic();
    setNow(new Date());
    await Promise.all([refetch(), checkPushPermission()]);
  });

  const handleOpenNotif = useCallback((notif: ClientNotification) => {
    haptic();
    if (!notif.isRead) markAsRead(notif.id);
    const route = notificationTapRoute(notif);
    if (route) openRoute(route);
    else setSelectedNotif(notif);
  }, [markAsRead]);

  const handleCloseModal = useCallback(() => setSelectedNotif(null), []);

  const handleSwipeDismiss = useCallback((id: string) => { dismissOne(id); }, [dismissOne]);

  const handleOpenLink = useCallback((route: Href) => { openRoute(route); }, []);

  const handleModalDelete = useCallback((id: string) => {
    haptic(HapticStyle.Medium);
    smoothLayout();
    dismissOne(id);
  }, [dismissOne]);

  const handleMarkAllAsRead = useCallback(() => {
    hapticSuccess();
    smoothLayout();
    markAllAsRead();
  }, [markAllAsRead]);

  const handleDismissAll = useCallback(() => {
    haptic(HapticStyle.Medium);
    Alert.alert(t('notifications.deleteAllTitle'), t('notifications.deleteAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => { haptic(HapticStyle.Heavy); smoothLayout(); setFilter('all'); dismissAll(); },
      },
    ]);
  }, [dismissAll, t]);

  const handleFilterChange = useCallback((next: Filter) => {
    if (next === filter) return;
    haptic();
    setFilter(next);
  }, [filter]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
  // Rows fade in once, the first time the first batch shows. A row virtualized
  // out and back in, or a later page, appears in place instead of replaying it.
  const seenRowsRef = useRef<Set<string>>(new Set());

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
    const animate = index < STAGGERED_ITEMS && !seenRowsRef.current.has(notif.id);
    seenRowsRef.current.add(notif.id);
    return (
      <FadeInView
        animate={animate}
        delay={animate ? Math.min(index * STAGGER_DELAY_MS, MAX_STAGGER_DELAY_MS) : 0}
        duration={250}
        distance={hp(8)}
      >
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
      <View style={[styles.pushBanner, { backgroundColor: isDark ? palette.goldNight : palette.goldUltraLight, borderColor: `${palette.gold}40` }]}>
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
          <RetryState
            withIcon
            message={t('notifications.loadErrorTitle')}
            hint={t('notifications.loadErrorHint')}
            onRetry={() => { haptic(); refetch(); }}
          />
        </FadeInView>
      );
    }

    if (filter === 'unread' && hasAny) {
      return (
        <EmptyState
          fadeInDelay={60}
          icon={CheckCheck}
          iconColor={palette.emerald}
          iconBg={`${palette.emerald}16`}
          title={t('notifications.noUnread')}
          hint={t('notifications.noUnreadHint')}
          action={{ label: t('notifications.showAll'), onPress: () => handleFilterChange('all'), variant: 'secondary' }}
        />
      );
    }

    const needsPush = pushPermission === 'denied';
    return (
      <EmptyState
        fadeInDelay={60}
        icon={Bell}
        title={t('notifications.noNotifications')}
        hint={t('notifications.noNotificationsHint')}
        action={needsPush
          ? { label: t('notifications.enableButton'), icon: BellRing, onPress: handleRequestPermission }
          : { label: t('home.discoverCta'), icon: Compass, onPress: () => { haptic(); openRoute('/(tabs)/discover'); } }}
      />
    );
  }, [isLoading, isError, hasAny, filter, pushPermission, t, refetch, handleFilterChange, handleRequestPermission]);

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
      <View style={{ height: hp(32) + insets.bottom }} />
    </>
  );

  const subtitle = !hasAny
    ? null
    : unreadCount > 0
      ? t('notifications.unreadCount', { count: unreadCount })
      : t('notifications.allCaughtUp');

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <ScreenHeader isScrolled={isScrolled}>
        <View style={styles.titleRow}>
          <HeaderBackButton onPress={goBack} />
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
                      <Text style={[styles.filterBadgeText, { fontFamily: fonts.bold }]}>{formatBadgeCount(unreadCount)}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScreenHeader>

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
            <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh}
              tintColor={theme.primaryLight} colors={[theme.primary]} progressBackgroundColor={theme.bgCard} />
          }
          onScroll={onScroll}
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
        onOpenLink={handleOpenLink}
        theme={theme}
        fonts={fonts}
        formatDate={formatFullDate}
        t={t}
      />
    </View>
  );
}
