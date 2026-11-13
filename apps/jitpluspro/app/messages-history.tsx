import { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { JitBell, JitClients, JitEye, JitMail, JitMessages } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { timeAgo } from '@/utils/date';
import { useNotificationHistory } from '@/hooks/useQueryHooks';
import type { NotificationRecord } from '@/types';

/** One past broadcast: its text, when it left, and how many customers received and opened it. */
const HistoryCard = memo(function HistoryCard({ item }: { item: NotificationRecord }) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const channel = item.channel ?? 'PUSH';
  const ChannelIcon = channel === 'EMAIL' ? JitMail : channel === 'WHATSAPP' ? JitMessages : JitBell;
  const receivedCount = channel === 'PUSH' ? (item.receivedCount ?? item.recipientCount) : item.recipientCount;
  const openedCount = item.readCount ?? 0;
  const isFailed = item.failureCount > 0 && (item.successCount || 0) === 0;
  const statusColor = isFailed ? theme.danger : theme.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={[styles.cardHeader, { flexDirection: row }]}>
        <ChannelIcon size={22} color={theme.text} strokeWidth={icon.stroke} />
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {item.title}
          </Text>
          <Text style={[styles.timeText, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {timeAgo(item.createdAt, locale)}
          </Text>
        </View>
      </View>

      <Text style={[styles.cardBody, { color: theme.textSecondary, textAlign }]} numberOfLines={3} maxFontSizeMultiplier={1.4}>
        {item.body}
      </Text>

      <View style={[styles.statsRow, { borderTopColor: theme.borderLight, flexDirection: row }]}>
        <View style={[styles.statItem, { flexDirection: row }]}>
          {isFailed
            ? <X size={13} color={statusColor} strokeWidth={icon.strokeSmall} />
            : <Check size={13} color={statusColor} strokeWidth={icon.strokeSmall} />}
          <Text style={[styles.statText, { color: statusColor }]} maxFontSizeMultiplier={1.3}>
            {isFailed ? t('messages.statusFailed') : t('messages.statusSent')}
          </Text>
        </View>
        <View style={[styles.statItem, { flexDirection: row }]}>
          <JitClients size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text style={[styles.statText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {t('messages.statReceived', { count: receivedCount.toLocaleString(getIntlLocale(locale)) })}
          </Text>
        </View>
        <View style={[styles.statItem, { flexDirection: row }]}>
          <JitEye size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text style={[styles.statText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {t('messages.statOpened', { count: openedCount.toLocaleString(getIntlLocale(locale)) })}
          </Text>
        </View>
      </View>
    </View>
  );
});

const keyExtractor = (item: NotificationRecord) => item.id;
const renderItem = ({ item }: { item: NotificationRecord }) => <HistoryCard item={item} />;
const ItemSeparator = () => <View style={styles.separator} />;

export default function MessagesHistoryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();

  const {
    data: history = [],
    isLoading,
    isRefetching,
    refetch,
  } = useNotificationHistory();

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('messages.history')} />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          ItemSeparatorComponent={ItemSeparator}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.empty}>
              <JitBell size={36} color={theme.textMuted} strokeWidth={1.5} style={styles.emptyIcon} />
              <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>{t('messages.noMessages')}</Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('messages.noMessagesHint')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  separator: { height: 8 },
  // Same bordered card as the "Mes outils" cards of Accueil.
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    letterSpacing: -0.2,
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
  // Inside the list: `center` (flex 1) has no height to fill there.
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 28 },
  emptyIcon: { marginBottom: 14 },
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
