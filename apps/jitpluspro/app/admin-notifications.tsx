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
} from 'react-native';
import {
  ArrowLeft,
  ShieldAlert,
  TrendingUp,
  Lightbulb,
  ListChecks,
  Gauge,
  CheckCheck,
  BellOff,
  ChevronRight,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react-native';
import { JitGift, JitMessages, JitPremium } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
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
  PLAN: { icon: JitPremium, color: '#D97706', labelKey: 'inbox.catPlan' },
  ACTIVITY: { icon: TrendingUp, color: '#059669', labelKey: 'inbox.catActivity' },
  TIP: { icon: Lightbulb, color: '#0284C7', labelKey: 'inbox.catTip' },
  SETUP: { icon: ListChecks, color: '#4F46E5', labelKey: 'inbox.catSetup' },
  QUOTA: { icon: Gauge, color: '#EA580C', labelKey: 'inbox.catQuota' },
  OFFER: { icon: JitGift, color: '#DB2777', labelKey: 'inbox.catOffer' },
  ADMIN: { icon: JitMessages, color: palette.violet, labelKey: 'inbox.catAdmin' },
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
  const { isRTL, row, textAlign, flip } = useDir();
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
            flexDirection: row,
            backgroundColor: unread ? theme.bgCard : theme.bgElevated,
            borderColor: unread ? `${cat.color}33` : theme.borderLight,
          },
          unread && styles.cardUnreadShadow,
          unread && { shadowColor: cat.color },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${cat.color}${unread ? '1F' : '14'}` }]}>
          <Icon size={ms(18)} color={unread ? cat.color : theme.textMuted} strokeWidth={icon.stroke} />
        </View>

        <View style={styles.cardBody}>
          <View style={[styles.metaRow, { flexDirection: row }]}>
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
            {unread && <View style={[styles.unreadDot, isRTL ? styles.unreadDotRtl : styles.unreadDotLtr, { backgroundColor: cat.color }]} />}
          </View>

          <Text
            style={[
              styles.cardTitle,
              { color: unread ? theme.text : theme.textSecondary, textAlign },
              unread && styles.cardTitleUnread,
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          <Text
            style={[styles.cardText, { color: unread ? theme.textSecondary : theme.textMuted, textAlign }]}
            numberOfLines={isExpanded ? undefined : 3}
          >
            {item.body}
          </Text>

          {(isLong || hasLink) && (
            <View style={[styles.actionsRow, { flexDirection: row }]}>
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
                <View style={[styles.openChip, isRTL ? styles.openChipRtl : styles.openChipLtr, { flexDirection: row, backgroundColor: `${cat.color}14` }]}>
                  <Text style={[styles.openChipText, { color: cat.color }]}>{t('inbox.open')}</Text>
                  <ChevronRight
                    size={ms(14)}
                    color={cat.color}
                    strokeWidth={icon.strokeSmall}
                    style={flip}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [theme, locale, t, expandedIds, handlePress, toggleExpand, isRTL, row, textAlign, flip]);

  const renderSectionHeader = useCallback(({ section }: { section: { key: InboxSectionKey } }) => (
    <Text style={[styles.sectionHeader, { color: theme.textMuted, backgroundColor: theme.bg, textAlign }]}>
      {t(SECTION_LABEL_KEY[section.key])}
    </Text>
  ), [theme, t, textAlign]);

  const subtitle = unreadCount === 0
    ? t('inbox.allRead')
    : unreadCount === 1
      ? t('inbox.unreadOne')
      : t('inbox.unreadMany', { count: unreadCount });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 12, flexDirection: row }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={icon.stroke} style={flip} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: theme.text, textAlign }]} numberOfLines={1}>
            {t('inbox.title')}
          </Text>
          {!isLoading && !isEmpty && (
            <Text
              style={[styles.headerSubtitle, { color: unreadCount > 0 ? theme.primary : theme.textMuted, textAlign }]}
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
              { backgroundColor: theme.primaryBg, flexDirection: row },
              markAllRead.isPending && { opacity: 0.5 },
            ]}
          >
            <CheckCheck size={ms(16)} color={theme.primary} strokeWidth={icon.stroke} />
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
            <BellOff size={ms(34)} color={theme.textMuted} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('inbox.errorTitle')}</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>{t('inbox.errorHint')}</Text>
          <ActionButton
            label={t('common.retry')}
            icon={RefreshCw}
            onPress={handleRefresh}
            style={styles.retryBtn}
          />
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.primaryBg }]}>
            <BellOff size={ms(34)} color={theme.primary} strokeWidth={icon.stroke} />
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
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: font.bold,
  },
  headerSubtitle: {
    fontSize: FS.sm,
    fontFamily: font.medium,
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
    fontFamily: font.semibold,
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
    fontFamily: font.semibold,
    marginBottom: hp(6),
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FS.sm,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: ms(20),
  },
  retryBtn: {
    marginTop: hp(20),
    paddingHorizontal: ms(18),
  },
  listContent: {
    paddingHorizontal: wp(16),
  },
  sectionHeader: {
    fontSize: ms(12),
    fontFamily: font.semibold,
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
    gap: wp(12),
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
    fontFamily: font.semibold,
    flexShrink: 1,
  },
  metaDot: {
    fontSize: ms(11),
    marginHorizontal: 5,
  },
  cardTime: {
    fontSize: ms(11),
    fontFamily: font.regular,
  },
  unreadDot: {
    width: ms(8),
    height: ms(8),
    borderRadius: 999,
  },
  unreadDotLtr: { marginLeft: 6 },
  unreadDotRtl: { marginRight: 6 },
  cardTitle: {
    fontSize: FS.md,
    fontFamily: font.medium,
    marginBottom: hp(3),
  },
  cardTitleUnread: {
    fontFamily: font.bold,
  },
  cardText: {
    fontSize: FS.sm,
    fontFamily: font.regular,
    lineHeight: ms(19),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: hp(10),
  },
  linkText: {
    fontSize: ms(12),
    fontFamily: font.semibold,
  },
  openChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    paddingVertical: ms(5),
  },
  openChipLtr: { paddingLeft: ms(12), paddingRight: ms(8) },
  openChipRtl: { paddingLeft: ms(8), paddingRight: ms(12) },
  openChipText: {
    fontSize: ms(12),
    fontFamily: font.semibold,
  },
  footerLoader: {
    marginVertical: hp(16),
  },
});
