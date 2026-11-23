import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Text } from '@/components/AppText';
import { ArrowDownUp, Search, User, type LucideIcon } from 'lucide-react-native';
import { JitClients, JitClock, JitGift, JitPersonAdd, JitStamp, JitStar } from '@/components/icons';
import { safeSelection } from '@/utils/haptics';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import { useDir } from '@/hooks/useDir';
import { ListSkeleton } from '@/components/Skeleton';
import { useClientList, useClientSegments } from '@/hooks/useQueryHooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INACTIVE_CLIENT_DAYS, NEW_CLIENT_DAYS } from '@/constants/app';
import { radius } from '@/utils/responsive';
import { font, icon as iconTokens, TAB_BAR_CLEARANCE } from '@/constants/design';
import { StateMessage } from '@/components/ui/StateMessage';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterChips, type FilterChipItem } from '@/components/ui/FilterChips';
import { OptionSheet, type OptionSection } from '@/components/ui/OptionSheet';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { timeAgo } from '@/utils/date';
import { initialsOf } from '@/utils/initials';
import { countForm } from '@/utils/countForm';
import type { ClientListItem, ClientListSort, ClientListView } from '@/types';

// Fixed row height keeps getItemLayout exact (text scaling is capped below).
const ROW_HEIGHT = 72;
const CARD_FONT_SCALE = 1.25;

// JitPlus icons only, drawn plain (no tinted tile), here and in the empty states.
// `defaultSort` mirrors the order the backend gives each view when no sort is sent.
const VIEWS: { key: ClientListView; labelKey: string; hintKey: string | null; Icon: LucideIcon; defaultSort: ClientListSort | null }[] = [
  { key: 'all', labelKey: 'clients.filterAll', hintKey: null, Icon: JitClients, defaultSort: 'recent' },
  { key: 'reward', labelKey: 'clients.filterReward', hintKey: 'clients.hintReward', Icon: JitGift, defaultSort: 'stamps' },
  { key: 'almost', labelKey: 'clients.filterAlmost', hintKey: 'clients.hintAlmost', Icon: JitStamp, defaultSort: 'stamps' },
  // Newest card first: not one of the menu's sorts.
  { key: 'new', labelKey: 'clients.filterNew', hintKey: 'clients.hintNew', Icon: JitStar, defaultSort: null },
  { key: 'inactive', labelKey: 'clients.filterInactive', hintKey: 'clients.hintInactive', Icon: JitClock, defaultSort: 'lastVisit' },
];

const SORTS: { key: ClientListSort; labelKey: string; hintKey: string }[] = [
  { key: 'recent', labelKey: 'clients.sortRecent', hintKey: 'clients.sortHintRecent' },
  { key: 'lastVisit', labelKey: 'clients.sortLastVisit', hintKey: 'clients.sortHintLastVisit' },
  { key: 'stamps', labelKey: 'clients.sortStamps', hintKey: 'clients.sortHintStamps' },
  { key: 'name', labelKey: 'clients.sortName', hintKey: 'clients.sortHintName' },
];

function getInitials(item: ClientListItem) {
  return initialsOf([item.prenom, item.nom]);
}

const ClientRow = React.memo(function ClientRow({
  item,
  rewardThreshold,
  isFirst,
  isLast,
  onOpenDetail,
}: {
  item: ClientListItem;
  rewardThreshold: number | undefined;
  isFirst: boolean;
  isLast: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const dir = useDir();

  // Quick-add clients can have no name: show their phone, or a label, never a bare "?".
  const displayName = [item.prenom, item.nom].filter(Boolean).join(' ') || item.telephone || t('clients.unnamed');
  const initials = getInitials(item);
  const hasThreshold = !!rewardThreshold && rewardThreshold > 0;
  const rewardReady = hasThreshold && item.stamps >= rewardThreshold;
  const progress = hasThreshold ? Math.min(item.stamps / rewardThreshold, 1) : 0;

  const lastVisitLabel = item.totalTransactions > 0
    ? t('clients.lastVisit', { time: timeAgo(item.lastVisit, locale) })
    : t('clients.neverVisited');
  const stampsLabel = hasThreshold ? `${item.stamps}/${rewardThreshold}` : String(item.stamps);
  const a11yLabel = [
    displayName,
    `${stampsLabel} ${t('common.stamps')}`,
    rewardReady ? t('clients.rewardReady') : null,
    lastVisitLabel,
  ].filter(Boolean).join(', ');

  // Plain navigation: no haptic (selection ticks are for value changes).
  const handlePress = useCallback(() => {
    onOpenDetail(item.id);
  }, [onOpenDetail, item.id]);

  return (
    <TouchableOpacity
      style={[
        styles.clientRow,
        { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: dir.row },
        isFirst ? styles.clientRowFirst : styles.clientRowDivider,
        isLast && styles.clientRowLast,
      ]}
      onPress={handlePress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={t('clients.openDetailHint')}
    >
      <View style={[styles.avatar, { backgroundColor: `${theme.primary}1A` }]} importantForAccessibility="no">
        {initials === '?' ? (
          <User size={20} color={theme.primary} strokeWidth={iconTokens.stroke} />
        ) : (
          <Text style={[styles.avatarText, { color: theme.primary }]} maxFontSizeMultiplier={CARD_FONT_SCALE}>
            {initials}
          </Text>
        )}
      </View>

      <View style={styles.clientInfo} importantForAccessibility="no-hide-descendants">
        <Text style={[styles.clientName, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={CARD_FONT_SCALE}>
          {displayName}
        </Text>
        <Text style={[styles.clientMeta, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={CARD_FONT_SCALE}>
          {lastVisitLabel}
        </Text>
        {hasThreshold && (
          <View style={[styles.progressTrack, { backgroundColor: theme.borderLight }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.primary, alignSelf: dir.alignStart }]} />
          </View>
        )}
      </View>

      {rewardReady ? (
        <View style={[styles.rewardBadge, { backgroundColor: `${theme.primary}1A`, flexDirection: dir.row }]} importantForAccessibility="no-hide-descendants">
          <JitGift size={13} color={theme.primary} strokeWidth={iconTokens.strokeSmall} />
          <Text style={[styles.rewardBadgeText, { color: theme.primary }]} numberOfLines={1} maxFontSizeMultiplier={CARD_FONT_SCALE}>
            {t('clients.rewardReady')}
          </Text>
        </View>
      ) : (
        <View style={[styles.stampsRow, { flexDirection: dir.row }]} importantForAccessibility="no-hide-descendants">
          <Text style={[styles.stamps, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={CARD_FONT_SCALE}>
            {item.stamps}
            {hasThreshold && <Text style={{ color: theme.textMuted }}>/{rewardThreshold}</Text>}
          </Text>
          <JitStamp size={13} color={theme.text} strokeWidth={iconTokens.strokeSmall} />
        </View>
      )}
    </TouchableOpacity>
  );
});

const EmptyState = React.memo(function EmptyState({
  search,
  view,
  onScan,
}: {
  search: string;
  view: ClientListView;
  onScan: () => void;
}) {
  const { t } = useLanguage();

  if (search) {
    return (
      <StateMessage
        Icon={Search}
        title={t('clients.noResults')}
        hint={t('clients.noResultsFor', { query: search })}
      />
    );
  }
  if (view === 'reward') {
    return (
      <StateMessage
        Icon={JitGift}
        title={t('clients.emptyRewardTitle')}
        hint={t('clients.emptyRewardHint')}
      />
    );
  }
  if (view === 'almost') {
    return (
      <StateMessage
        Icon={JitStamp}
        title={t('clients.emptyAlmostTitle')}
        hint={t('clients.emptyAlmostHint')}
      />
    );
  }
  if (view === 'new') {
    return (
      <StateMessage
        Icon={JitStar}
        title={t('clients.emptyNewTitle')}
        hint={t('clients.emptyNewHint', { days: NEW_CLIENT_DAYS })}
      />
    );
  }
  if (view === 'inactive') {
    return (
      <StateMessage
        Icon={JitClock}
        title={t('clients.emptyInactiveTitle')}
        hint={t('clients.emptyInactiveHint', { days: INACTIVE_CLIENT_DAYS })}
      />
    );
  }
  return (
    <StateMessage
      Icon={JitClients}
      title={t('clients.noClients')}
      hint={t('clients.noClientsHint')}
      actionLabel={t('clients.addClient')}
      ActionIcon={JitPersonAdd}
      onAction={onScan}
    />
  );
});

const keyExtractor = (item: ClientListItem) => item.id;
const getItemLayout = (_: unknown, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index });

export default function ClientsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const dir = useDir();
  const listRef = useRef<FlatList<ClientListItem>>(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<ClientListView>('all');
  /** null = the view's own order. Kept across views: a merchant who sorts by name expects it to stay. */
  const [sort, setSort] = useState<ClientListSort | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const { query, reload, reloadIfStale } = useClientList(debouncedSearch, view, sort);
  const { data: segments, refetch: refetchSegments } = useClientSegments();
  const {
    data,
    isPending,
    isError,
    isFetching,
    isPlaceholderData,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query;

  useFocusEffect(reloadIfStale);

  // Rows can shift between two page loads (new client, stamp change), so drop repeats.
  const clients = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const rows: ClientListItem[] = [];
    for (const page of data.pages) {
      for (const client of page.clients) {
        if (!seen.has(client.id)) {
          seen.add(client.id);
          rows.push(client);
        }
      }
    }
    return rows;
  }, [data]);
  const firstPage = data?.pages[0];
  const total = firstPage?.pagination.total ?? 0;
  const rewardThreshold = firstPage?.rewardThreshold;

  const onRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([reload(), refetchSegments()]);
    } finally {
      setPullRefreshing(false);
    }
  }, [reload, refetchSegments]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !isPlaceholderData) {
      fetchNextPage().catch(() => {});
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, isPlaceholderData, fetchNextPage]);

  const retryNextPage = useCallback(() => {
    fetchNextPage().catch(() => {});
  }, [fetchNextPage]);

  const scrollToTop = useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), []);

  const selectView = useCallback((next: ClientListView) => {
    safeSelection();
    setView(next);
    scrollToTop();
  }, [scrollToTop]);

  const openDetail = useCallback((clientId: string) => {
    router.push({ pathname: '/client-detail', params: { id: clientId } });
  }, [router]);

  const goToScan = useCallback(() => router.push('/scan-qr'), [router]);

  const lastIndex = clients.length - 1;
  const renderClient = useCallback(({ item, index }: { item: ClientListItem; index: number }) => (
    <ClientRow
      item={item}
      rewardThreshold={rewardThreshold}
      isFirst={index === 0}
      isLast={index === lastIndex}
      onOpenDetail={openDetail}
    />
  ), [openDetail, rewardThreshold, lastIndex]);

  const activeView = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const countLabel = t(`clients.${debouncedSearch ? 'results' : 'count'}${countForm(total)}`, { count: total.toLocaleString(getIntlLocale(locale)) });
  // "6 clients · cadeau à remettre · par ordre alphabétique": what the view keeps, then the order
  // when it is not the view's own (the view hint already implies it).
  const effectiveSort = sort ?? activeView.defaultSort;
  const sortHintKey = sort || view === 'all' ? SORTS.find((s) => s.key === effectiveSort)?.hintKey : undefined;
  const summary = [
    countLabel,
    !debouncedSearch && activeView.hintKey
      ? t(activeView.hintKey, { days: view === 'new' ? NEW_CLIENT_DAYS : INACTIVE_CLIENT_DAYS })
      : null,
    sortHintKey ? t(sortHintKey) : null,
  ].filter(Boolean).join(' · ');

  // Segment sizes are for the whole list: hidden during a search, where they would not match.
  const viewChips = useMemo<FilterChipItem<ClientListView>[]>(
    () => VIEWS.map((v) => ({
      key: v.key,
      label: t(v.labelKey),
      Icon: v.Icon,
      count: debouncedSearch || !segments ? undefined : segments[v.key],
    })),
    [t, segments, debouncedSearch],
  );

  const sortSections = useMemo<OptionSection[]>(() => [{
    key: 'sort',
    title: t('clients.sortTitle'),
    options: SORTS.map((s) => ({ key: s.key, label: t(s.labelKey) })),
    selected: effectiveSort ?? '',
    onSelect: (key) => {
      safeSelection();
      // Picking the view's own order goes back to "no explicit sort".
      setSort(key === activeView.defaultSort ? null : (key as ClientListSort));
      scrollToTop();
    },
  }], [t, effectiveSort, activeView.defaultSort, scrollToTop]);

  const sortAction = useMemo(() => ({
    Icon: ArrowDownUp,
    label: t('clients.sort'),
    badge: sort ? 1 : 0,
    onPress: () => setSortOpen(true),
  }), [t, sort]);
  const searching = isFetching && isPlaceholderData;
  const listContentStyle = useMemo(
    () => [styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }],
    [insets.bottom],
  );

  let footer: React.ReactElement | null = null;
  if (isFetchingNextPage) {
    footer = (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  } else if (isFetchNextPageError) {
    footer = (
      <TouchableOpacity
        style={styles.footer}
        onPress={retryNextPage}
        accessibilityRole="button"
        accessibilityLabel={t('common.retry')}
      >
        <Text style={[styles.footerError, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
          {t('clients.loadMoreError')} <Text style={{ color: theme.primary }}>{t('common.retry')}</Text>
        </Text>
      </TouchableOpacity>
    );
  } else if (!hasNextPage && clients.length > 0) {
    footer = (
      <View style={styles.footer}>
        <Text style={[styles.footerEnd, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {t('common.allDisplayed')}
        </Text>
      </View>
    );
  }

  let content: React.ReactNode;
  if (isError && !data) {
    content = (
      <StateMessage
        title={t('clients.loadErrorTitle')}
        hint={t('clients.loadErrorHint')}
        actionLabel={t('common.retry')}
        onAction={onRefresh}
      />
    );
  } else if (isPending) {
    content = (
      <View style={styles.list}>
        <ListSkeleton count={7} />
      </View>
    );
  } else {
    content = (
      <FlatList
        ref={listRef}
        data={clients}
        renderItem={renderClient}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        contentContainerStyle={listContentStyle}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={9}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListFooterComponent={footer}
        ListEmptyComponent={<EmptyState search={debouncedSearch} view={view} onScan={goToScan} />}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 12, flexDirection: dir.row }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
          {t('clients.title')}
        </Text>
        <DemoVideoButton id="clients" variant="header" />
      </View>

      <SearchBar
        placeholder={t('clients.searchPlaceholder')}
        clearLabel={t('clients.clearSearch')}
        searching={searching}
        onSearch={setDebouncedSearch}
        action={sortAction}
      />

      <FilterChips items={viewChips} selected={view} onSelect={selectView} />

      <View style={styles.summaryRow}>
        {data ? (
          <Text
            style={[styles.summaryText, { color: theme.textMuted, textAlign: dir.textAlign }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            accessibilityLiveRegion="polite"
          >
            {summary}
          </Text>
        ) : null}
      </View>

      <View style={styles.flex1}>{content}</View>

      <OptionSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        title={t('clients.sortTitle')}
        sections={sortSections}
        doneLabel={t('common.close')}
        closeOnSelect
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: font.semibold,
    letterSpacing: -0.5,
  },

  summaryRow: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 20 },
  summaryText: { fontSize: 13, fontFamily: font.medium },

  list: { paddingHorizontal: 16, paddingTop: 2 },

  // Rows of one grouped card (same 18 radius and border as the Accueil cards):
  // side borders on every row, top/bottom borders and corners on the ends.
  clientRow: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  clientRowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  clientRowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  clientRowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: font.semibold },
  clientInfo: { flex: 1, marginHorizontal: 12 },
  clientName: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: font.semibold,
    letterSpacing: -0.2,
  },
  clientMeta: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
    fontFamily: font.medium,
  },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 7, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  stampsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stamps: { fontSize: 14, fontFamily: font.semibold, letterSpacing: -0.2 },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  rewardBadgeText: { fontSize: 12, fontFamily: font.semibold },

  footer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, minHeight: 60 },
  footerEnd: { fontSize: 12, fontFamily: font.regular, opacity: 0.6 },
  footerError: { fontSize: 13, fontFamily: font.medium, textAlign: 'center' },
});
