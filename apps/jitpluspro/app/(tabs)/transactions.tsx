import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { JitStamp } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { safeImpact } from '@/utils/haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListSkeleton } from '@/components/Skeleton';
import { useTransactions } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms } from '@/utils/responsive';
import { HistoryListItem, buildHomeRows, type HomeRow } from '@/components/TransactionRow';
import type { Transaction } from '@/types';
import { ActionButton } from '@/components/ui/ActionButton';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { font, TAB_BAR_CLEARANCE } from '@/constants/design';

/** Full paginated transaction history: the "Transactions" tab of the bottom bar. */
export default function TransactionsScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();

  const {
    data,
    isLoading: loading,
    isRefetching: refreshing,
    isError,
    hasNextPage: hasMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: loadMore,
    refetch,
  } = useTransactions();

  const transactions = useMemo<Transaction[]>(
    () => (data?.pages ?? []).flatMap((p) => p.transactions),
    [data],
  );

  const rows = useMemo<HomeRow[]>(() => buildHomeRows(transactions, t, locale), [transactions, t, locale]);

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderRow = useCallback(({ item }: { item: HomeRow }) => <HistoryListItem row={item} />, []);

  const keyExtractor = useCallback((item: HomeRow) => item.id, []);

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore) loadMore();
  }, [hasMore, loadingMore, loadMore]);

  const showSkeleton = loading && transactions.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('transactionsScreen.title')} />

      {isError && transactions.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <AlertCircle size={ms(36)} color={theme.danger} strokeWidth={1.5} style={styles.emptyIcon} />
          <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
            {t('common.errorTitle')}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
            {t('common.errorHint')}
          </Text>
          <ActionButton
            label={t('common.retry')}
            onPress={() => {
              safeImpact(Haptics.ImpactFeedbackStyle.Light);
              refetch();
            }}
            style={styles.retryBtn}
          />
        </View>
      ) : showSkeleton ? (
        <View style={styles.list}>
          <ListSkeleton count={8} />
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={12}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View
                style={styles.footerLoader}
                accessible
                accessibilityLabel={t('common.loading')}
              >
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : !hasMore && rows.length > 0 ? (
              <View style={styles.footerEndWrap}>
                <View style={[styles.footerDivider, { backgroundColor: theme.border }]} />
                <Text style={[styles.footerEnd, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                  {t('common.allDisplayed')}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <JitStamp size={ms(36)} color={theme.textMuted} strokeWidth={1.5} style={styles.emptyIcon} />
              <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
                {t('activity.noActivity')}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                {t('activity.noActivityHint')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 0 },

  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontFamily: font.semibold,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 48,
    lineHeight: 22,
    fontFamily: font.regular,
  },
  footerLoader: { alignItems: 'center', paddingVertical: 24 },
  footerEndWrap: { alignItems: 'center', paddingVertical: 20 },
  footerDivider: { width: 40, height: 1, marginBottom: 12, borderRadius: 1, opacity: 0.4 },
  footerEnd: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: font.regular,
    opacity: 0.5,
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
    alignSelf: 'center',
  },
});
