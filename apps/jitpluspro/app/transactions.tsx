import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { ArrowLeft, AlertCircle, Activity } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { safeImpact } from '@/utils/haptics';
import { useRouter } from 'expo-router';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListSkeleton } from '@/components/Skeleton';
import { useTransactions } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms } from '@/utils/responsive';
import { HistoryListItem, buildHomeRows, type HomeRow } from '@/components/TransactionRow';
import type { Transaction } from '@/types';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
/** Full paginated transaction history (reached via "Tout afficher" on Accueil). */
export default function TransactionsScreen() {
  const theme = useTheme();
  const dir = useDir();
  const router = useRouter();
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
      <View style={[styles.headerBar, { flexDirection: dir.row, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={HIT_SLOP_LARGE}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('transactionsScreen.title')}
        </Text>
      </View>

      {isError && transactions.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIllustration, { backgroundColor: `${theme.danger}14` }]}>
            <AlertCircle size={ms(36)} color={theme.danger} strokeWidth={icon.stroke} />
          </View>
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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
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
              <Activity size={ms(36)} color={palette.charbon} strokeWidth={icon.stroke} style={styles.emptyIcon} />
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
  list: { paddingHorizontal: 16, paddingTop: 8 },

  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIllustration: {
    width: ms(88),
    height: ms(88),
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyIcon: { marginBottom: 24 },
  emptyTitle: {
    fontSize: 22,
    fontFamily: font.bold,
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
