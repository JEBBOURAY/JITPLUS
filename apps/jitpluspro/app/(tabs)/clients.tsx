import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Search, User, X, type LucideIcon } from 'lucide-react-native';
import { JitClients, JitClock, JitGift, JitPersonAdd, JitStamp } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { safeImpact, safeSelection } from '@/utils/haptics';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import { useDir } from '@/hooks/useDir';
import { ListSkeleton } from '@/components/Skeleton';
import { useClientList } from '@/hooks/useQueryHooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SEARCH_DEBOUNCE_MS, INACTIVE_CLIENT_DAYS } from '@/constants/app';
import { radius } from '@/utils/responsive';
import { font, icon as iconTokens, TAB_BAR_CLEARANCE } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { timeAgo } from '@/utils/date';
import { initialsOf } from '@/utils/initials';
import type { ClientListItem, ClientListView } from '@/types';

type Theme = ReturnType<typeof useTheme>;

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
// Fixed row height keeps getItemLayout exact (text scaling is capped below).
const ROW_HEIGHT = 72;
const CARD_FONT_SCALE = 1.25;

// JitPlus icons only, drawn plain (no tinted tile), here and in the empty states.
const VIEWS: { key: ClientListView; labelKey: string; hintKey: string; Icon: LucideIcon }[] = [
  { key: 'all', labelKey: 'clients.filterAll', hintKey: 'clients.hintAll', Icon: JitClients },
  { key: 'reward', labelKey: 'clients.filterReward', hintKey: 'clients.hintReward', Icon: JitGift },
  { key: 'loyal', labelKey: 'clients.filterLoyal', hintKey: 'clients.hintLoyal', Icon: JitStamp },
  { key: 'inactive', labelKey: 'clients.filterInactive', hintKey: 'clients.hintInactive', Icon: JitClock },
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

const ViewChip = React.memo(function ViewChip({
  view,
  label,
  Icon,
  selected,
  onSelect,
}: {
  view: ClientListView;
  label: string;
  Icon: LucideIcon;
  selected: boolean;
  onSelect: (view: ClientListView) => void;
}) {
  const theme = useTheme();
  const dir = useDir();
  const fg = selected ? theme.textInverse : theme.textSecondary;
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { flexDirection: dir.row },
        selected
          ? { backgroundColor: theme.primary, borderColor: theme.primary }
          : { backgroundColor: theme.bgCard, borderColor: theme.border },
      ]}
      onPress={() => onSelect(view)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Icon size={15} color={fg} strokeWidth={iconTokens.stroke} />
      <Text style={[styles.chipText, { color: fg }]} maxFontSizeMultiplier={1.4}>{label}</Text>
    </TouchableOpacity>
  );
});

function StateMessage({
  theme,
  Icon,
  title,
  hint,
  actionLabel,
  ActionIcon,
  onAction,
}: {
  theme: Theme;
  /** Drawn plain above the title. */
  Icon?: LucideIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  ActionIcon?: LucideIcon;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stateContainer}>
      {Icon ? <Icon size={36} color={theme.textMuted} strokeWidth={1.5} style={styles.stateIcon} /> : null}
      <Text style={[styles.stateTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>{title}</Text>
      <Text style={[styles.stateText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>{hint}</Text>
      {actionLabel && onAction && (
        <ActionButton
          label={actionLabel}
          icon={ActionIcon}
          style={styles.stateCta}
          onPress={() => {
            safeImpact(Haptics.ImpactFeedbackStyle.Light);
            onAction();
          }}
        />
      )}
    </View>
  );
}

const EmptyState = React.memo(function EmptyState({
  search,
  view,
  theme,
  onScan,
}: {
  search: string;
  view: ClientListView;
  theme: Theme;
  onScan: () => void;
}) {
  const { t } = useLanguage();

  if (search) {
    return (
      <StateMessage
        theme={theme}
        Icon={Search}
        title={t('clients.noResults')}
        hint={t('clients.noResultsFor', { query: search })}
      />
    );
  }
  if (view === 'reward') {
    return (
      <StateMessage
        theme={theme}
        Icon={JitGift}
        title={t('clients.emptyRewardTitle')}
        hint={t('clients.emptyRewardHint')}
      />
    );
  }
  if (view === 'inactive') {
    return (
      <StateMessage
        theme={theme}
        Icon={JitClock}
        title={t('clients.emptyInactiveTitle')}
        hint={t('clients.emptyInactiveHint', { days: INACTIVE_CLIENT_DAYS })}
      />
    );
  }
  return (
    <StateMessage
      theme={theme}
      Icon={JitClients}
      title={t('clients.noClients')}
      hint={t('clients.noClientsHint')}
      actionLabel={t('clients.addClient')}
      ActionIcon={JitPersonAdd}
      onAction={onScan}
    />
  );
});

/**
 * Owns the typed text so keystrokes re-render only this bar; the screen gets the
 * trimmed term once typing pauses (or right away when cleared).
 */
const ClientSearchBar = React.memo(function ClientSearchBar({
  searching,
  onSearch,
}: {
  searching: boolean;
  onSearch: (term: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    const term = text.trim();
    if (!term) {
      onSearch('');
      return;
    }
    const timer = setTimeout(() => onSearch(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, onSearch]);

  const clear = useCallback(() => {
    setText('');
    inputRef.current?.blur();
  }, []);

  return (
    <View style={styles.searchContainer}>
      <View style={[styles.searchBar, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: dir.row }]}>
        {searching ? (
          <ActivityIndicator size="small" color={theme.primary} style={styles.searchIcon} />
        ) : (
          <Search size={16} color={palette.charbon} strokeWidth={iconTokens.stroke} style={styles.searchIcon} />
        )}
        <TextInput
          ref={inputRef}
          style={[styles.searchInput, { color: theme.text, textAlign: dir.textAlign }]}
          placeholder={t('clients.searchPlaceholder')}
          placeholderTextColor={theme.textMuted}
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('clients.searchPlaceholder')}
          maxFontSizeMultiplier={1.6}
        />
        {text.length > 0 && (
          <TouchableOpacity
            onPress={clear}
            hitSlop={HIT_SLOP_LARGE}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel={t('clients.clearSearch')}
          >
            <X size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
          </TouchableOpacity>
        )}
      </View>
    </View>
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
  const chipsRef = useRef<ScrollView>(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<ClientListView>('all');
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const { query, reload, reloadIfStale } = useClientList(debouncedSearch, view);
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
      await reload();
    } finally {
      setPullRefreshing(false);
    }
  }, [reload]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !isPlaceholderData) {
      fetchNextPage().catch(() => {});
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, isPlaceholderData, fetchNextPage]);

  const retryNextPage = useCallback(() => {
    fetchNextPage().catch(() => {});
  }, [fetchNextPage]);

  const selectView = useCallback((next: ClientListView) => {
    safeSelection();
    setView(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

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
  // Darija counts 2 to 10 with the plural noun ("3 زبناء") and the singular from 11 ("15 زبون").
  const countForm = total === 1 ? 'One' : total >= 2 && total <= 10 ? 'Few' : 'Other';
  const countLabel = t(`clients.${debouncedSearch ? 'results' : 'count'}${countForm}`, { count: total.toLocaleString(getIntlLocale(locale)) });
  const summary = debouncedSearch
    ? countLabel
    : `${countLabel} · ${t(activeView.hintKey, { days: INACTIVE_CLIENT_DAYS })}`;
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
        theme={theme}
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
        ListEmptyComponent={<EmptyState search={debouncedSearch} view={view} theme={theme} onScan={goToScan} />}
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

      <ClientSearchBar searching={searching} onSearch={setDebouncedSearch} />

      <View>
        <ScrollView
          ref={chipsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chipsRow, { flexDirection: dir.row }]}
          keyboardShouldPersistTaps="handled"
          // Arabic reads from the right: start on the first filter when the row overflows.
          onContentSizeChange={dir.isRTL ? () => chipsRef.current?.scrollToEnd({ animated: false }) : undefined}
        >
          {VIEWS.map((v) => (
            <ViewChip
              key={v.key}
              view={v.key}
              label={t(v.labelKey)}
              Icon={v.Icon}
              selected={v.key === view}
              onSelect={selectView}
            />
          ))}
        </ScrollView>
      </View>

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

  searchContainer: { paddingHorizontal: 16, paddingTop: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    borderWidth: 1,
  },
  searchIcon: { width: 18 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 0 : 8,
    fontFamily: font.medium,
  },
  clearBtn: {
    minWidth: 44,
    minHeight: 44,
    marginVertical: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chipsRow: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  chip: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: font.semibold, letterSpacing: -0.1 },
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

  stateContainer: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32 },
  stateIcon: { marginBottom: 14 },
  stateTitle: {
    fontSize: 20,
    fontFamily: font.semibold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    fontFamily: font.regular,
  },
  stateCta: {
    marginTop: 24,
    paddingHorizontal: 24,
  },

  footer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, minHeight: 60 },
  footerEnd: { fontSize: 12, fontFamily: font.regular, opacity: 0.6 },
  footerError: { fontSize: 13, fontFamily: font.medium, textAlign: 'center' },
});
