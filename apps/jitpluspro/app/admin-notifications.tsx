import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { ArrowLeft, Bell, Megaphone, Mail, Send, CheckCheck } from 'lucide-react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import { timeAgo } from '@/utils/date';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';

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
      markSingleRead.mutate(item.id);
    }
  }, [markSingleRead]);

  const handleMarkAllRead = useCallback(() => {
    if (unreadCount > 0) {
      markAllRead.mutate();
    }
  }, [markAllRead, unreadCount]);

  const renderItem = useCallback(({ item }: { item: AdminNotification }) => {
    const Icon = channelIcon(item.channel);
    const color = channelColor(item.channel, item.isRead);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
        style={[
          styles.card,
          {
            backgroundColor: item.isRead ? theme.bgCard : `${palette.violet}08`,
            borderColor: item.isRead ? theme.borderLight : `${palette.violet}25`,
          },
        ]}
      >
        {/* Unread dot */}
        {!item.isRead && <View style={styles.unreadDot} />}

        <View style={[styles.iconWrap, { backgroundColor: color + '15' }]}>
          <Icon size={ms(18)} color={color} strokeWidth={1.6} />
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
            numberOfLines={3}
          >
            {item.body}
          </Text>
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
  }, [theme, channelIcon, channelColor, locale, handlePress]);

  const notifications = data?.notifications ?? [];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <LinearGradient colors={brandGradient} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Bell size={18} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.headerTitle}>{t('account.notifications')}</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={handleMarkAllRead}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.markAllBtn}
          >
            <CheckCheck size={ms(14)} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        )}
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: `${palette.violet}10` }]}>
            <Bell size={ms(36)} color={palette.violet} strokeWidth={1.2} />
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
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: hp(14),
    paddingHorizontal: wp(16),
  },
  backBtn: {
    marginRight: wp(8),
    padding: 4,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: FS.lg,
    fontFamily: 'Lexend_700Bold',
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
    fontFamily: 'Inter_700Bold',
  },
  markAllBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: ms(16),
    width: ms(32),
    height: ms(32),
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
    width: ms(72),
    height: ms(72),
    borderRadius: ms(36),
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
    fontFamily: 'Inter_400Regular',
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
  unreadDot: {
    position: 'absolute',
    top: ms(16),
    left: ms(6),
    width: ms(6),
    height: ms(6),
    borderRadius: ms(3),
    backgroundColor: palette.violet,
  },
  iconWrap: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
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
    fontFamily: 'Inter_400Regular',
    lineHeight: ms(18),
    marginBottom: hp(6),
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTime: {
    fontSize: ms(11),
    fontFamily: 'Inter_400Regular',
  },
});
