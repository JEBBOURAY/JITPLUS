import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { ArrowLeft, Bell, Megaphone, Mail, Send } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminNotifications, useMarkAdminNotifsRead, type AdminNotification } from '@/hooks/useQueryHooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { timeAgo } from '@/utils/date';
import { wp, ms, fontSize as FS, radius } from '@/utils/responsive';

export default function AdminNotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const { data, isLoading, refetch, isRefetching } = useAdminNotifications(1);
  const markRead = useMarkAdminNotifsRead();

  // Mark all as read when screen opens
  useEffect(() => {
    markRead.mutate();
  }, []);

  const channelIcon = useCallback((channel: string | null) => {
    switch (channel) {
      case 'EMAIL': return Mail;
      case 'PUSH': return Send;
      default: return Megaphone;
    }
  }, []);

  const channelColor = useCallback((channel: string | null) => {
    switch (channel) {
      case 'EMAIL': return '#EA4335';
      case 'PUSH': return theme.primary;
      default: return theme.primary;
    }
  }, [theme.primary]);

  const renderItem = useCallback(({ item }: { item: AdminNotification }) => {
    const Icon = channelIcon(item.channel);
    const color = channelColor(item.channel);

    return (
      <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
        <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
          <Icon size={20} color={color} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]} numberOfLines={3}>
            {item.body}
          </Text>
          <Text style={[styles.cardTime, { color: theme.textMuted }]}>
            {timeAgo(item.createdAt, locale)}
          </Text>
        </View>
      </View>
    );
  }, [theme, channelIcon, channelColor, locale]);

  const notifications = data?.notifications ?? [];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <LinearGradient colors={brandGradient} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Bell size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.headerTitle}>Notifications</Text>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Bell size={48} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.textMuted }]}>
            Aucune notification
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            Vous recevrez ici les communications de JitPlus
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: wp(4), paddingBottom: insets.bottom + 20 }}
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
    paddingBottom: 14,
    paddingHorizontal: wp(4),
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: FS.lg,
    fontFamily: 'Lexend_700Bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(8),
  },
  emptyTitle: {
    fontSize: FS.md,
    fontFamily: 'Lexend_600SemiBold',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: FS.sm,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: ms(14),
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FS.md,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 4,
  },
  cardText: {
    fontSize: FS.sm,
    fontFamily: 'Inter_400Regular',
    lineHeight: ms(18),
    marginBottom: 6,
  },
  cardTime: {
    fontSize: ms(11),
    fontFamily: 'Inter_400Regular',
  },
});
