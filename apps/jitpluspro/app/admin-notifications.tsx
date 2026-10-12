import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
  I18nManager,
} from 'react-native';
import {
  ArrowLeft,
  ShieldAlert,
  Crown,
  TrendingUp,
  Lightbulb,
  ListChecks,
  Gauge,
  Gift,
  Megaphone,
  CheckCheck,
  BellOff,
  ChevronRight,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useAdminNotifications,
  useMarkAdminNotifsRead,
  useMarkSingleAdminNotifRead,
  useAdminNotifUnreadCount,
  type AdminNotification,
  type InboxCategory,
} from '@/hooks/useQueryHooks';
import { timeAgo } from '@/utils/date';
import { groupInboxByDate, type InboxSectionKey } from '@/utils/inboxGroups';
import { routeForAction } from '@/utils/notificationRoutes';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { logWarn } from '@/utils/devLogger';

const CATEGORY_STYLE: Record<InboxCategory, { icon: LucideIcon; color: string; labelKey: string }> = {
  SECURITY: { icon: ShieldAlert, color: '#DC2626', labelKey: 'inbox.catSecurity' },
  PLAN: { icon: Crown, color: '#D97706', labelKey: 'inbox.catPlan' },
  ACTIVITY: { icon: TrendingUp, color: '#059669', labelKey: 'inbox.catActivity' },
  TIP: { icon: Lightbulb, color: '#0284C7', labelKey: 'inbox.catTip' },
  SETUP: { icon: ListChecks, color: '#4F46E5', labelKey: 'inbox.catSetup' },
  QUOTA: { icon: Gauge, color: '#EA580C', labelKey: 'inbox.catQuota' },
  OFFER: { icon: Gift, color: '#DB2777', labelKey: 'inbox.catOffer' },
  ADMIN: { icon: Megaphone, color: palette.violet, labelKey: 'inbox.catAdmin' },
};

const SECTION_LABEL_KEY: Record<InboxSectionKey, string> = {
  today: 'inbox.sectionToday',
  yesterday: 'inbox.sectionYesterday',
  week: 'inbox.sectionWeek',
  older: 'inbox.sectionOlder',
};

const LONG_BODY_CHARS = 110;
const SELF_ROUTE = '/admin-notifications';

function styleFor(category: AdminNotification['category']) {
  return (category && CATEGORY_STYLE[category]) || CATEGORY_STYLE.ADMIN;
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AdminNotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAdminNotifications();
  const markAllRead = useMarkAdminNotifsRead();
  const markSingleRead = useMarkSingleAdminNotifRead();
  const { data: unreadData, refetch: refetchUnread } = useAdminNotifUnreadCount();
  const unreadCount = unreadData?.count ?? 0;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const seen = new Set<string>();
    // Pages can overlap when new items arrive between two page loads.
    const items = (data?.pages ?? [])
      .flatMap((p) => p.notifications)
      .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
    return groupInboxByDate(items);
  }, [data]);

  const isEmpty = sections.length === 0;

  const markRead = useCallback((item: AdminNotification) => {
    if (item.isRead) return;
    markSingleRead.mutate(item.id, {
      onError: () => logWarn('Notif', 'Failed to mark as read:', item.id),
    });
  }, [markSingleRead]);

  const toggleExpand = useCallback((item: AdminNotification) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    markRead(item);
  }, [markRead]);

  const handlePress = useCallback((item: AdminNotification, isLong: boolean) => {
    const route = routeForAction(item.action);
    if (route && route !== SELF_ROUTE) {
      markRead(item);
      router.push(route);
    } else if (isLong) {
      toggleExpand(item);
    } else {
      markRead(item);
    }
  }, [markRead, router, toggleExpand]);

  const handleMarkAllRead = useCallback(() => {
    if (unreadCount === 0 || markAllRead.isPending) return;
    markAllRead.mutate(undefined, {
      onError: () => logWarn('Notif', 'Failed to mark all read'),
    });
  }, [markAllRead, unreadCount]);

  const handleRefresh = useCallback(() => {
    refetch();
    refetchUnread();
  }, [refetch, refetchUnread]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(({ item, section }: { item: AdminNotification; section: { key: InboxSectionKey } }) => {
    const cat = styleFor(item.category);
    const Icon = cat.icon;
    const unread = !item.isRead;
    const isExpanded = expandedIds.has(item.id);
    const isLong = item.body.length > LONG_BODY_CHARS || item.body.includes('\n');
    const route = routeForAction(item.action);
    const hasLink = !!route && route !== SELF_ROUTE;
    const when = section.key === 'yesterday' ? clockTime(item.createdAt) : timeAgo(item.createdAt, locale);
    const categoryLabel = t(cat.labelKey);

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => handlePress(item, isLong)}
        accessibilityRole="button"
        accessibilityLabel={`${categoryLabel}. ${item.title}. ${item.body}`}
        style={[
          styles.card,
          {
            backgroundColor: unread ? theme.bgCard : theme.bgElevated,
            borderColor: unread ? `${cat.color}33` : theme.borderLight,
          },
          unread && styles.cardUnreadShadow,
          unread && { shadowColor: cat.color },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${cat.color}${unread ? '1F' : '14'}` }]}>
          <Icon size={ms(18)} color={unread ? cat.color : theme.textMuted} strokeWidth={1.8} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.metaRow}>
            <Text
              style={[styles.categoryLabel, { color: unread ? cat.color : theme.textMuted }]}
              numberOfLines={1}
            >
              {categoryLabel}
            </Text>
            <Text style={[styles.metaDot, { color: theme.textMuted }]}>·</Text>
            <Text style={[styles.cardTime, { color: theme.textMuted }]} numberOfLines={1}>
              {when}
            </Text>
            <View style={{ flex: 1 }} />
            {unread && <View style={[styles.unreadDot, { backgroundColor: cat.color }]} />}
          </View>

          <Text
            style={[
              styles.cardTitle,
              { color: unread ? theme.text : theme.textSecondary },
              unread && styles.cardTitleUnread,
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          <Text
            style={[styles.cardText, { color: unread ? theme.textSecondary : theme.textMuted }]}
            numberOfLines={isExpanded ? undefined : 3}
          >
            {item.body}
          </Text>

          {(isLong || hasLink) && (
            <View style={styles.actionsRow}>
              {isLong && (
                <TouchableOpacity
                  onPress={() => toggleExpand(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t(isExpanded ? 'common.collapse' : 'common.expand')}
                >
                  <Text style={[styles.linkText, { color: theme.textMuted }]}>
                    {t(isExpanded ? 'common.collapse' : 'common.expand')}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              {hasLink && (
                <View style={[styles.openChip, { backgroundColor: `${cat.color}14` }]}>
                  <Text style={[styles.openChipText, { color: cat.color }]}>{t('inbox.open')}</Text>
                  <ChevronRight
                    size={ms(14)}
                    color={cat.color}
                    strokeWidth={2.2}
                    style={I18nManager.isRTL ? styles.flipX : undefined}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [theme, locale, t, expandedIds, handlePress, toggleExpand]);

  const renderSectionHeader = useCallback(({ section }: { section: { key: InboxSectionKey } }) => (
    <Text style={[styles.sectionHeader, { color: theme.textMuted, backgroundColor: theme.bg }]}>
      {t(SECTION_LABEL_KEY[section.key])}
    </Text>
  ), [theme, t]);

  const subtitle = unreadCount === 0
    ? t('inbox.allRead')
    : unreadCount === 1
      ? t('inbox.unreadOne')
      : t('inbox.unreadMany', { count: unreadCount });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} style={I18nManager.isRTL ? styles.flipX : undefined} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {t('inbox.title')}
          </Text>
          {!isLoading && !isEmpty && (
            <Text
              style={[styles.headerSubtitle, { color: unreadCount > 0 ? theme.primary : theme.textMuted }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={handleMarkAllRead}
            disabled={markAllRead.isPending}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('inbox.markAllReadA11y')}
            style={[
              styles.markAllBtn,
              { backgroundColor: theme.primaryBg },
              markAllRead.isPending && { opacity: 0.5 },
            ]}
          >
            <CheckCheck size={ms(15)} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.markAllText, { color: theme.primary }]}>{t('inbox.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : isError && isEmpty ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: `${palette.charbon}12` }]}>
            <BellOff size={ms(34)} color={theme.textMuted} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('inbox.errorTitle')}</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>{t('inbox.errorHint')}</Text>
          <TouchableOpacity
            onPress={handleRefresh}
            activeOpacity={0.8}
            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
          >
            <RefreshCw size={ms(15)} color="#fff" strokeWidth={2} />
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.primaryBg }]}>
            <BellOff size={ms(34)} color={theme.primary} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('inbox.emptyTitle')}</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>{t('inbox.emptyHint')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={styles.footerLoader} color={theme.primary} />
            ) : null
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    marginRight: 2,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  headerSubtitle: {
    fontSize: FS.sm,
    fontFamily: 'Lexend_500Medium',
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: ms(12),
    height: ms(34),
  },
  markAllText: {
    fontSize: ms(12),
    fontFamily: 'Lexend_600SemiBold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(32),
  },
  emptyIcon: {
    width: ms(84),
    height: ms(84),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(18),
  },
  emptyTitle: {
    fontSize: FS.md,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: hp(6),
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FS.sm,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: ms(20),
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: hp(20),
    paddingHorizontal: ms(18),
    height: ms(42),
    borderRadius: 999,
  },
  retryText: {
    color: '#fff',
    fontSize: FS.sm,
    fontFamily: 'Lexend_600SemiBold',
  },
  listContent: {
    paddingHorizontal: wp(16),
  },
  sectionHeader: {
    fontSize: ms(12),
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingTop: hp(14),
    paddingBottom: hp(8),
    paddingHorizontal: wp(4),
  },
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: ms(14),
    marginBottom: hp(10),
  },
  cardUnreadShadow: {
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  iconWrap: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(12),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: wp(12),
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(4),
  },
  categoryLabel: {
    fontSize: ms(11),
    fontFamily: 'Lexend_600SemiBold',
    flexShrink: 1,
  },
  metaDot: {
    fontSize: ms(11),
    marginHorizontal: 5,
  },
  cardTime: {
    fontSize: ms(11),
    fontFamily: 'Lexend_400Regular',
  },
  unreadDot: {
    width: ms(8),
    height: ms(8),
    borderRadius: ms(4),
    marginLeft: 6,
  },
  cardTitle: {
    fontSize: FS.md,
    fontFamily: 'Lexend_500Medium',
    marginBottom: hp(3),
  },
  cardTitleUnread: {
    fontFamily: 'Lexend_700Bold',
  },
  cardText: {
    fontSize: FS.sm,
    fontFamily: 'Lexend_400Regular',
    lineHeight: ms(19),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: hp(10),
  },
  linkText: {
    fontSize: ms(12),
    fontFamily: 'Lexend_600SemiBold',
  },
  openChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    paddingLeft: ms(12),
    paddingRight: ms(8),
    paddingVertical: ms(5),
  },
  openChipText: {
    fontSize: ms(12),
    fontFamily: 'Lexend_600SemiBold',
  },
  footerLoader: {
    marginVertical: hp(16),
  },
  flipX: {
    transform: [{ scaleX: -1 }],
  },
});
