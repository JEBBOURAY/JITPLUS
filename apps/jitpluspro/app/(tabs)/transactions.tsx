import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Text } from '@/components/AppText';
import { AlertCircle, SlidersHorizontal, X } from 'lucide-react-native';
import { JitStamp } from '@/components/icons';
import { safeSelection } from '@/utils/haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ListSkeleton } from '@/components/Skeleton';
import { useTeamMembers, useTransactions } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius } from '@/utils/responsive';
import { formatCurrency, getIntlLocale } from '@/config/currency';
import { countForm } from '@/utils/countForm';
import { hasActiveFilters, sheetFilterCount } from '@/utils/historyFilters';
import { HistoryListItem, buildHomeRows, type HomeRow } from '@/components/TransactionRow';
import type { Transaction, TransactionFilters, TransactionKind, TransactionPeriod } from '@/types';
import { StateMessage } from '@/components/ui/StateMessage';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterChips, type FilterChipItem } from '@/components/ui/FilterChips';
import { OptionSheet, type OptionSection } from '@/components/ui/OptionSheet';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { font, icon as iconTokens, TAB_BAR_CLEARANCE } from '@/constants/design';

const KINDS: { key: TransactionKind; labelKey: string }[] = [
  { key: 'all', labelKey: 'transactionsScreen.kindAll' },
  { key: 'stamps', labelKey: 'transactionsScreen.kindStamps' },
  { key: 'rewards', labelKey: 'transactionsScreen.kindRewards' },
  { key: 'games', labelKey: 'transactionsScreen.kindGames' },
  { key: 'coupons', labelKey: 'transactionsScreen.kindCoupons' },
  { key: 'adjustments', labelKey: 'transactionsScreen.kindAdjustments' },
  { key: 'cancelled', labelKey: 'transactionsScreen.kindCancelled' },
];

const PERIODS: { key: TransactionPeriod; labelKey: string }[] = [
  { key: 'all', labelKey: 'transactionsScreen.periodAll' },
  { key: 'today', labelKey: 'transactionsScreen.periodToday' },
  { key: 'week', labelKey: 'transactionsScreen.periodWeek' },
  { key: 'month', labelKey: 'transactionsScreen.periodMonth' },
  { key: 'thisMonth', labelKey: 'transactionsScreen.periodThisMonth' },
];

const STAFF_ALL = '__all';
const STAFF_OWNER = 'owner';

/** A filter set in the sheet, shown under the chips so it can be removed in one tap. */
function FilterPill({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <TouchableOpacity
      style={[styles.pill, { backgroundColor: theme.primaryBg, flexDirection: dir.row }]}
      onPress={onRemove}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={removeLabel}
    >
      <Text style={[styles.pillText, { color: theme.primary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      <X size={14} color={theme.primary} strokeWidth={iconTokens.strokeSmall} />
    </TouchableOpacity>
  );
}

/** Full paginated transaction history, with filters: the "Transactions" tab of the bottom bar. */
export default function TransactionsScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const currency = useCurrency();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const listRef = useRef<FlatList<HomeRow>>(null);

  const [kind, setKind] = useState<TransactionKind>('all');
  const [period, setPeriod] = useState<TransactionPeriod>('all');
  const [staff, setStaff] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchResetKey, setSearchResetKey] = useState(0);

  const filters = useMemo<TransactionFilters>(() => ({ kind, period, staff, search }), [kind, period, staff, search]);

  // "Done by" only makes sense for an owner with a team (the team list is owner-only, Pro plan).
  const { data: members } = useTeamMembers(!isTeamMember);
  const staffOptions = useMemo(
    () => (members && members.length > 0
      ? [
          { key: STAFF_ALL, label: t('transactionsScreen.staffAll') },
          { key: STAFF_OWNER, label: t('transactionsScreen.staffOwner') },
          ...members.map((m) => ({ key: m.id, label: m.nom })),
        ]
      : null),
    [members, t],
  );

  const {
    data,
    isLoading: loading,
    isRefetching,
    isFetching,
    isPlaceholderData,
    isError,
    hasNextPage: hasMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: loadMore,
    refetch,
  } = useTransactions(filters);

  const transactions = useMemo<Transaction[]>(
    () => (data?.pages ?? []).flatMap((p) => p.transactions),
    [data],
  );

  const rows = useMemo<HomeRow[]>(() => buildHomeRows(transactions, t, locale), [transactions, t, locale]);

  const scrollToTop = useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), []);

  const selectKind = useCallback((next: TransactionKind) => {
    safeSelection();
    setKind(next);
    scrollToTop();
  }, [scrollToTop]);

  const resetSheetFilters = useCallback(() => {
    safeSelection();
    setPeriod('all');
    setStaff(null);
  }, []);

  const clearAll = useCallback(() => {
    resetSheetFilters();
    setKind('all');
    setSearch('');
    setSearchResetKey((k) => k + 1);
    scrollToTop();
  }, [resetSheetFilters, scrollToTop]);

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderRow = useCallback(({ item }: { item: HomeRow }) => <HistoryListItem row={item} />, []);

  const keyExtractor = useCallback((item: HomeRow) => item.id, []);

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !isPlaceholderData) loadMore();
  }, [hasMore, loadingMore, isPlaceholderData, loadMore]);

  const kindChips = useMemo<FilterChipItem<TransactionKind>[]>(
    () => KINDS.map((k) => ({ key: k.key, label: t(k.labelKey) })),
    [t],
  );

  const sections = useMemo<OptionSection[]>(() => {
    const list: OptionSection[] = [{
      key: 'period',
      title: t('transactionsScreen.period'),
      options: PERIODS.map((p) => ({ key: p.key, label: t(p.labelKey) })),
      selected: period,
      onSelect: (key) => {
        safeSelection();
        setPeriod(key as TransactionPeriod);
        scrollToTop();
      },
    }];
    if (staffOptions) {
      list.push({
        key: 'staff',
        title: t('transactionsScreen.staff'),
        options: staffOptions,
        selected: staff ?? STAFF_ALL,
        onSelect: (key) => {
          safeSelection();
          setStaff(key === STAFF_ALL ? null : key);
          scrollToTop();
        },
      });
    }
    return list;
  }, [t, period, staff, staffOptions, scrollToTop]);

  const sheetCount = sheetFilterCount(filters);
  const filtered = hasActiveFilters(filters);
  const periodLabel = period !== 'all' ? t(PERIODS.find((p) => p.key === period)!.labelKey) : null;
  const staffLabel = staff ? staffOptions?.find((o) => o.key === staff)?.label ?? null : null;

  // "42 transactions · +180 tampons · 6 cadeaux · 1 250,00 DH": totals of the filtered rows (page 1).
  const firstPage = data?.pages[0];
  const total = firstPage?.pagination?.total;
  const summary = firstPage?.summary;
  const intlLocale = getIntlLocale(locale);
  const counted = (key: 'count' | 'stamps' | 'rewards', n: number) =>
    t(`transactionsScreen.${key}${countForm(n)}`, { count: n.toLocaleString(intlLocale) });
  const summaryText = total === undefined ? null : [
    counted('count', total),
    summary && summary.stampsGiven > 0 ? counted('stamps', summary.stampsGiven) : null,
    summary && summary.rewardsRedeemed > 0 ? counted('rewards', summary.rewardsRedeemed) : null,
    summary && summary.revenue > 0 ? formatCurrency(summary.revenue, currency, intlLocale) : null,
  ].filter(Boolean).join(' · ');

  const showSkeleton = loading && transactions.length === 0;
  const searching = isFetching && isPlaceholderData;

  const filterAction = useMemo(() => ({
    Icon: SlidersHorizontal,
    label: t('transactionsScreen.filters'),
    badge: sheetCount,
    onPress: () => setSheetOpen(true),
  }), [t, sheetCount]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('transactionsScreen.title')} back={false} />

      <SearchBar
        placeholder={t('transactionsScreen.searchPlaceholder')}
        clearLabel={t('clients.clearSearch')}
        searching={searching}
        onSearch={setSearch}
        action={filterAction}
        resetKey={searchResetKey}
      />

      <FilterChips items={kindChips} selected={kind} onSelect={selectKind} />

      {periodLabel || staffLabel ? (
        <View style={[styles.pillsRow, { flexDirection: dir.row }]}>
          {periodLabel ? (
            <FilterPill
              label={periodLabel}
              removeLabel={t('transactionsScreen.removeFilter', { name: periodLabel })}
              onRemove={() => { safeSelection(); setPeriod('all'); }}
            />
          ) : null}
          {staffLabel ? (
            <FilterPill
              label={staffLabel}
              removeLabel={t('transactionsScreen.removeFilter', { name: staffLabel })}
              onRemove={() => { safeSelection(); setStaff(null); }}
            />
          ) : null}
        </View>
      ) : null}

      <View style={[styles.summaryRow, { flexDirection: dir.row }]}>
        <Text
          style={[styles.summaryText, { color: theme.textMuted, textAlign: dir.textAlign }]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
          accessibilityLiveRegion="polite"
        >
          {summaryText ?? ''}
        </Text>
        {filtered ? (
          <TouchableOpacity onPress={clearAll} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.clearText, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>
              {t('transactionsScreen.clearFilters')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isError && transactions.length === 0 && !loading ? (
        <StateMessage
          Icon={AlertCircle}
          iconColor={theme.danger}
          title={t('common.errorTitle')}
          hint={t('common.errorHint')}
          actionLabel={t('common.retry')}
          onAction={refetch}
        />
      ) : showSkeleton ? (
        <View style={styles.list}>
          <ListSkeleton count={8} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={12}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isPlaceholderData && !loadingMore}
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
            filtered ? (
              <StateMessage
                Icon={SlidersHorizontal}
                title={t('transactionsScreen.emptyTitle')}
                hint={t('transactionsScreen.emptyHint')}
                actionLabel={t('transactionsScreen.clearFilters')}
                actionVariant="secondary"
                onAction={clearAll}
              />
            ) : (
              <StateMessage Icon={JitStamp} title={t('activity.noActivity')} hint={t('activity.noActivityHint')} />
            )
          }
        />
      )}

      <OptionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('transactionsScreen.filtersTitle')}
        sections={sections}
        doneLabel={t('transactionsScreen.showResults')}
        resetLabel={t('transactionsScreen.clearFilters')}
        onReset={sheetCount > 0 ? resetSheetFilters : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 0 },

  pillsRow: { flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  pill: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    maxWidth: '100%',
  },
  pillText: { fontSize: 13, fontFamily: font.medium, flexShrink: 1 },

  summaryRow: { minHeight: 34, alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 6 },
  summaryText: { flex: 1, fontSize: 13, fontFamily: font.medium },
  clearText: { fontSize: 13, fontFamily: font.semibold },

  footerLoader: { alignItems: 'center', paddingVertical: 24 },
  footerEndWrap: { alignItems: 'center', paddingVertical: 20 },
  footerDivider: { width: 40, height: 1, marginBottom: 12, borderRadius: 1, opacity: 0.4 },
  footerEnd: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: font.regular,
    opacity: 0.5,
  },
});
