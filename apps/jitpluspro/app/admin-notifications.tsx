import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { ArrowLeft, Bell, Megaphone, Mail, Send, CheckCheck, BellOff, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme, brandGradient, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useAdminNotifications,
  useMarkAdminNotifsRead,
  useMarkSingleAdminNotifRead,
  useAdminNotifUnreadCount,
  type AdminNotification,
} from '@/hooks/useQueryHooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { timeAgo } from '@/utils/date';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { logWarn } from '@/utils/devLogger';

export default function AdminNotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const { data, isLoading, refetch, isRefetching } = useAdminNotifications(1);
  const markAllRead = useMarkAdminNotifsRead();
  const markSingleRead = useMarkSingleAdminNotifRead();
  const { data: unreadData } = useAdminNotifUnreadCount();
  const unreadCount = unreadData?.count ?? 0;
  // Long messages are truncated to 3 lines by default; tap "Voir plus" to read them in full.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const channelIcon = useCallback((channel: string | null) => {
    switch (channel) {
      case 'EMAIL': return Mail;
      case 'PUSH': return Send;
      default: return Megaphone;
    }
  }, []);

  const channelColor = useCallback((channel: string | null, isRead: boolean) => {
    if (isRead) return theme.textMuted;
    switch (channel) {
      case 'EMAIL': return '#EA4335';
      case 'PUSH': return palette.violet;
      default: return palette.violet;
    }
  }, [theme.textMuted]);

  const handlePress = useCallback((item: AdminNotification) => {
    if (!item.isRead) {
      markSingleRead.mutate(item.id, {
        onError: () => logWarn('Notif', 'Failed to mark as read:', item.id),
      });
    }
  }, [markSingleRead]);

  const toggleExpand = useCallback((item: AdminNotification) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    handlePress(item);
  }, [handlePress]);

  const handleMarkAllRead = useCallback(() => {
    if (unreadCount > 0) {
      markAllRead.mutate(undefined, {
        onError: () => logWarn('Notif', 'Failed to mark all read'),
      });
    }
  }, [markAllRead, unreadCount]);

  const renderItem = useCallback(({ item }: { item: AdminNotification }) => {
    const Icon = channelIcon(item.channel);
    const color = channelColor(item.channel, item.isRead);
    const isExpanded = expandedIds.has(item.id);
    const isLong = item.body.length > 90 || item.body.includes('\n');

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
        style={[
          styles.card,
          {
            backgroundColor: item.isRead ? theme.bgCard : `${palette.violet}08`,
            borderColor: item.isRead ? theme.borderLight : `${palette.violet}25`,
            borderLeftWidth: item.isRead ? 1 : ms(3),
            borderLeftColor: item.isRead ? theme.borderLight : palette.violet,
            shadowColor: item.isRead ? 'transparent' : palette.violet,
            shadowOpacity: item.isRead ? 0 : 0.08,
            shadowRadius: item.isRead ? 0 : 12,
            shadowOffset: { width: 0, height: 2 },
            elevation: item.isRead ? 0 : 3,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: color + '15' }]}>
          <Icon size={ms(16)} color={color} strokeWidth={1.5} />
        </View>
        <View style={styles.cardBody}>
          <Text
            style={[
              styles.cardTitle,
              { color: item.isRead ? theme.textMuted : theme.text },
              !item.isRead && styles.cardTitleUnread,
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text
            style={[
              styles.cardText,
              { color: item.isRead ? theme.textMuted : theme.textSecondary },
            ]}
            numberOfLines={isExpanded ? undefined : 3}
          >
            {item.body}
          </Text>
          {isLong && (
            <TouchableOpacity
              onPress={() => toggleExpand(item)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              activeOpacity={0.7}
              style={styles.expandBtn}
              accessibilityRole="button"
              accessibilityLabel={t(isExpanded ? 'common.collapse' : 'common.expand')}
            >
              <Text style={[styles.expandBtnText, { color: theme.primary }]}>
                {t(isExpanded ? 'common.collapse' : 'common.expand')}
              </Text>
              {isExpanded
                ? <ChevronUp size={ms(13)} color={theme.primary} strokeWidth={2} />
                : <ChevronDown size={ms(13)} color={theme.primary} strokeWidth={2} />}
            </TouchableOpacity>
          )}
          <View style={styles.cardFooter}>
            <Text style={[styles.cardTime, { color: theme.textMuted }]}>
              {timeAgo(item.createdAt, locale)}
            </Text>
            {item.isRead && (
              <CheckCheck size={ms(12)} color={theme.textMuted} strokeWidth={1.5} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [theme, channelIcon, channelColor, locale, handlePress, expandedIds, toggleExpand, t]);

  const notifications = data?.notifications ?? [];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* â”€â”€ Simple header â€” matches stores.tsx style â”€â”€ */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('account.notifications')}</Text>
        {unreadCount > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{unreadCount}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={handleMarkAllRead}
            disabled={markAllRead.isPending}
            hitSlop={8}
            activeOpacity={0.7}
            style={[styles.markAllBtn, markAllRead.isPending && { opacity: 0.5 }, { backgroundColor: theme.primaryBg }]}
          >
            <CheckCheck size={ms(16)} color={theme.primary} strokeWidth={1.5} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: `${palette.charbon}12` }]}>
            <BellOff size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {t('account.noNotifications')}
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            {t('account.noNotificationsHint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />
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
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  backBtn: {
    marginRight: 2,
  },
  headerBadge: {
    marginLeft: wp(8),
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: ms(20),
    height: ms(20),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  markAllBtn: {
    borderRadius: 8,
    width: ms(36),
    height: ms(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(32),
  },
  emptyIcon: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(16),
  },
  emptyTitle: {
    fontSize: FS.md,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: hp(6),
  },
  emptySubtitle: {
    fontSize: FS.sm,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: ms(20),
  },
  listContent: {
    paddingHorizontal: wp(16),
    paddingTop: hp(12),
  },
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: ms(14),
    marginBottom: hp(10),
    position: 'relative',
  },
  iconWrap: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: wp(12),
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
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
    lineHeight: ms(18),
    marginBottom: hp(6),
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    marginBottom: hp(8),
  },
  expandBtnText: {
    fontSize: ms(12),
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTime: {
    fontSize: ms(11),
    fontFamily: 'Lexend_400Regular',
  },
});
