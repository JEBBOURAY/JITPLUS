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
  Send,
  Mail,
  MessageCircle,
  Eye,
  CheckCircle2,
  XCircle,
} from 'lucide-react-native';
import { JitBell } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { timeAgo } from '@/utils/date';
import { useNotificationHistory } from '@/hooks/useQueryHooks';
import type { NotificationRecord } from '@/types';

type HistoryFilter = 'ALL' | 'PUSH' | 'EMAIL' | 'WHATSAPP';

export default function MessagesHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign, flip } = useDir();
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
      const ChannelIcon = channel === 'EMAIL' ? Mail : channel === 'WHATSAPP' ? MessageCircle : JitBell;
      const receivedCount = channel === 'PUSH' ? (item.receivedCount ?? item.recipientCount) : item.recipientCount;
      const openedCount = item.readCount ?? 0;
      const isFailed = item.failureCount > 0 && (item.successCount || 0) === 0;
      const statusColor = isFailed ? theme.danger : theme.textMuted;

      return (
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <View style={[styles.cardHeader, { flexDirection: row }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${theme.primary}1A` }]}>
              <ChannelIcon size={18} color={theme.primary} strokeWidth={icon.stroke} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={[styles.timeText, { color: theme.textMuted, textAlign }]}>
                {timeAgo(item.createdAt, locale)}
              </Text>
            </View>
          </View>

          <Text style={[styles.cardBody, { color: theme.textSecondary, textAlign }]} numberOfLines={3}>
            {item.body}
          </Text>

          <View style={[styles.statsRow, { borderTopColor: theme.borderLight, flexDirection: row }]}>
            <View style={[styles.statItem, { flexDirection: row }]}>
              {isFailed
                ? <XCircle size={12} color={statusColor} strokeWidth={icon.strokeSmall} />
                : <CheckCircle2 size={12} color={statusColor} strokeWidth={icon.strokeSmall} />}
              <Text style={[styles.statText, { color: statusColor }]}>
                {isFailed ? t('messages.statusFailed') : t('messages.statusSent')}
              </Text>
            </View>
            <View style={[styles.statItem, { flexDirection: row }]}>
              <Send size={12} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
              <Text style={[styles.statText, { color: theme.textMuted }]}>
                {t('messages.statReceived', { count: receivedCount })}
              </Text>
            </View>
            <View style={[styles.statItem, { flexDirection: row }]}>
              <Eye size={12} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
              <Text style={[styles.statText, { color: theme.textMuted }]}>
                {t('messages.statOpened', { count: openedCount })}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [locale, t, theme, row, textAlign],
  );
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 12, flexDirection: row }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={icon.stroke} style={flip} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('messages.history')}
        </Text>
      </View>

      <View style={styles.filtersWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { flexDirection: row }]}>
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
                <JitBell size={32} color={palette.charbon} strokeWidth={icon.stroke} />
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
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: font.bold,
    letterSpacing: -0.3,
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
    fontFamily: font.semibold,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: font.semibold,
  },
  timeText: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: font.regular,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: font.regular,
  },
  statsRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontFamily: font.medium,
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
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: font.semibold,
    marginBottom: 6,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
    fontFamily: font.regular,
  },
});
