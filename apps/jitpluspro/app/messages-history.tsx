import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  Bell,
  Clock,
  Send,
  Mail,
  Eye,
  CheckCircle2,
  XCircle,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { timeAgo } from '@/utils/date';
import { useNotificationHistory } from '@/hooks/useQueryHooks';
import type { NotificationRecord } from '@/hooks/useQueryHooks';

type HistoryFilter = 'ALL' | 'PUSH' | 'EMAIL' | 'WHATSAPP';

const CHANNEL_COLORS = {
  PUSH: '#7C3AED',
  EMAIL: '#EA4335',
  WHATSAPP: '#25D366',
} as const;

export default function MessagesHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const [filter, setFilter] = React.useState<HistoryFilter>('ALL');

  const {
    data: history = [],
    isLoading,
    isRefetching,
    refetch,
  } = useNotificationHistory(true);

  const filteredHistory = useMemo(() => {
    if (filter === 'ALL') return history;
    return history.filter((item) => (item.channel ?? 'PUSH') === filter);
  }, [history, filter]);

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const filterOptions = useMemo(
    () => [
      { key: 'ALL' as const, label: t('messages.filterAll') },
      { key: 'PUSH' as const, label: t('messages.filterPush') },
      { key: 'EMAIL' as const, label: t('messages.filterEmail') },
    ],
    [t],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationRecord }) => {
      const channel = item.channel ?? 'PUSH';
      const color =
        channel === 'EMAIL'
          ? CHANNEL_COLORS.EMAIL
          : channel === 'WHATSAPP'
            ? CHANNEL_COLORS.WHATSAPP
            : CHANNEL_COLORS.PUSH;

      const ChannelIcon = channel === 'EMAIL' ? Mail : Send;
      const receivedCount = channel === 'PUSH' ? (item.receivedCount ?? item.recipientCount) : item.recipientCount;
      const openedCount = item.readCount ?? 0;
      const isFailed = item.failureCount > 0 && (item.successCount || 0) === 0;

      return (
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}> 
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: color + '14' }]}>
              <ChannelIcon size={16} color={color} strokeWidth={2} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.timeRow}>
                <Clock size={11} color={theme.textMuted} />
                <Text style={[styles.timeText, { color: theme.textMuted }]}>
                  {timeAgo(item.createdAt, locale)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.cardBody, { color: theme.textSecondary }]} numberOfLines={3}>
            {item.body}
          </Text>

          <View style={[styles.statsRow, { borderTopColor: theme.borderLight }]}> 
            <View style={[styles.statusPill, { backgroundColor: (isFailed ? theme.danger : theme.success) + '18' }]}> 
              {isFailed ? <XCircle size={12} color={theme.danger} /> : <CheckCircle2 size={12} color={theme.success} />}
              <Text style={[styles.statusText, { color: isFailed ? theme.danger : theme.success }]}>
                {isFailed ? t('messages.statusFailed') : t('messages.statusSent')}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Send size={12} color={theme.textMuted} />
              <Text style={[styles.statText, { color: theme.textMuted }]}>
                {t('messages.statReceived', { count: receivedCount })}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Eye size={12} color={color} />
              <Text style={[styles.statText, { color }]}>
                {t('messages.statOpened', { count: openedCount })}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [locale, t, theme],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}> 
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}> 
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('messages.history')}
        </Text>
      </View>

      <View style={styles.filtersWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filterOptions.map((option) => {
            const active = filter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => setFilter(option.key)}
                activeOpacity={0.8}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? theme.primary : theme.bgCard,
                    borderColor: active ? theme.primary : theme.borderLight,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
              >
                <Text style={[styles.filterText, { color: active ? '#fff' : theme.text }]} maxFontSizeMultiplier={1.3}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, paddingTop: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={theme.primary} />}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={[styles.emptyIcon, { backgroundColor: `${palette.charbon}12` }]}>
                <Bell size={32} color={palette.charbon} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('messages.noMessages')}</Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('messages.noMessagesHint')}</Text>
            </View>
          }
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
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  backBtn: {
    marginRight: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  filtersWrap: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  timeText: {
    fontSize: 11,
    fontFamily: 'Lexend_500Medium',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Lexend_500Medium',
  },
  statsRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontFamily: 'Lexend_600SemiBold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 6,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
    fontFamily: 'Lexend_500Medium',
  },
});
