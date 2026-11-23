import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, FlatList, RefreshControl, ScrollView, StyleSheet, Pressable, ActivityIndicator, Platform,
  type ListRenderItem,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgePercent, ChevronDown, MapPin, Navigation, Search, X, type LucideIcon } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import {
  DEAL_FEED_TABS, moroccoCityLabel, type ClientDealSummary, type DealFeedSort, type DealFeedTab,
} from '@jitplus/shared/src/deals';
import { Text } from '@/components/AppText';
import EmptyState from '@/components/EmptyState';
import RetryState from '@/components/RetryState';
import SearchField from '@/components/SearchField';
import Skeleton from '@/components/Skeleton';
import ActionSheet, { type ActionSheetOption } from '@/components/ActionSheet';
import DealRow, { DEAL_ROW_THUMB } from '@/components/deals/DealRow';
import DealAlertCard from '@/components/deals/DealAlertCard';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  dealArea, useDealCategoryCounts, useDealCities, useDealCityPreference, useDealsFeed,
} from '@/hooks/useDealHooks';
import { useDealLocation } from '@/hooks/useDealLocation';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';
import { DEBOUNCE_MS } from '@/constants';
import { DEAL_SEARCH_MAX, DEAL_SEARCH_MIN } from '@/services/api/deals';
import { CATEGORIES } from '@/utils/categories';
import { suggestAlertCity } from '@/utils/dealAlerts';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { isEntityId } from '@/utils/ids';
import { wp, hp, ms, fontSize } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

/** The city sheet has no scroll: the cities with the most deals only. */
const MAX_CITY_OPTIONS = 8;
const SKELETON_ROWS = [0, 1, 2, 3];

export default function DealsScreen() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ClientDealSummary>>(null);

  const [tab, setTab] = useState<DealFeedTab>('nearby');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<DealFeedSort>('recommended');
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [cityKey, setCityKey, cityReady] = useDealCityPreference();
  const { coords, resolved, request: requestLocation } = useDealLocation(t);
  const area = useMemo(() => dealArea(cityKey, coords), [cityKey, coords]);
  // The saved list is short: it is searched, never filtered or re-ordered.
  const filterable = tab !== 'saved';
  const filters = useMemo(
    () => ({ category: filterable ? category : null, q: query, sort: filterable ? sort : 'recommended' as const }),
    [filterable, category, query, sort],
  );
  const feed = useDealsFeed(tab, area, filters, cityReady && resolved);
  const categoryCounts = useDealCategoryCounts(tab, area, cityReady && resolved && filterable);
  const [citySheet, setCitySheet] = useState(false);
  const cities = useDealCities(coords, citySheet);

  // Offset pages can overlap when deals are published between two pages.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: ClientDealSummary[] = [];
    for (const page of feed.data?.pages ?? []) {
      for (const deal of page.items) {
        if (!seen.has(deal.id)) { seen.add(deal.id); out.push(deal); }
      }
    }
    return out;
  }, [feed.data]);

  useEffect(() => {
    const text = searchText.trim();
    const timer = setTimeout(() => setQuery(text.length >= DEAL_SEARCH_MIN ? text : null), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const serverCity = feed.data?.pages[0]?.cityKey ?? null;
  const suggestedCity = feed.data?.pages[0]?.suggestedCity ?? null;
  const alertCity = useMemo(() => suggestAlertCity(cityKey, coords, serverCity), [cityKey, coords, serverCity]);
  const cityLabel = cityKey
    ? moroccoCityLabel(cityKey, locale)
    : coords ? t('deals.feed.aroundMe') : serverCity ? moroccoCityLabel(serverCity, locale) : t('deals.feed.allMorocco');

  // Only the categories that have deals for this tab and area, most deals first.
  // The selected one stays so it can be seen and cleared; on error, all of them.
  const categoryChips = useMemo(() => {
    const all = CATEGORIES.filter((c) => c.id !== 'all');
    if (categoryCounts.isError && !categoryCounts.data) return all;
    const counts = categoryCounts.data?.counts ?? {};
    return all
      .filter((c) => (counts[c.id] ?? 0) > 0 || c.id === category)
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  }, [categoryCounts.data, categoryCounts.isError, category]);

  const scrollTop = useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), []);
  const chooseTab = useCallback((next: DealFeedTab) => { haptic(); setTab(next); scrollTop(); }, [scrollTop]);
  const chooseCategory = useCallback((next: string | null) => { haptic(); setCategory(next); scrollTop(); }, [scrollTop]);
  const toggleSort = useCallback(() => {
    haptic();
    setSort((current) => (current === 'discount' ? 'recommended' : 'discount'));
    scrollTop();
  }, [scrollTop]);
  const closeSearch = useCallback(() => { setSearching(false); setSearchText(''); setQuery(null); scrollTop(); }, [scrollTop]);
  useCloseOnBack(searching, closeSearch);
  const chooseCity = useCallback((key: string) => { haptic(); setCityKey(key); scrollTop(); }, [setCityKey, scrollTop]);

  const openDeal = useCallback((deal: ClientDealSummary) => {
    if (!isEntityId(deal.id)) return;
    haptic();
    router.push({ pathname: '/deal/[id]', params: { id: deal.id } });
  }, [router]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = feed;
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  const cityOptions = useMemo<ActionSheetOption[]>(() => {
    const list = [...(cities.data?.cities ?? [])]
      .filter((c) => c.dealCount > 0)
      .sort((a, b) => b.dealCount - a.dealCount)
      .slice(0, MAX_CITY_OPTIONS);
    return [
      {
        key: 'auto',
        label: t('deals.city.useMyLocation'),
        icon: Navigation,
        onPress: () => { setCityKey(null); scrollTop(); if (!coords) void requestLocation(); },
      },
      ...list.map((c) => ({
        key: c.key,
        label: `${moroccoCityLabel(c.key, locale)} · ${t(pluralKey('deals.city.count', c.dealCount), { count: c.dealCount })}`,
        icon: MapPin,
        onPress: () => { setCityKey(c.key); scrollTop(); },
      })),
    ];
  }, [cities.data, coords, locale, requestLocation, scrollTop, setCityKey, t]);

  const renderItem = useCallback<ListRenderItem<ClientDealSummary>>(
    ({ item }) => <DealRow deal={item} onPress={openDeal} />,
    [openDeal],
  );

  const loading = !cityReady || !resolved || feed.isLoading;
  // A failed next page or pull-to-refresh keeps its pages (react-query v5 still
  // sets isError): the list stays on screen, only an empty feed shows the error.
  const loadFailed = feed.isError && items.length === 0;
  const showLocationHint = tab === 'nearby' && !cityKey && !coords && resolved;

  const header = (
    <>
      {showLocationHint && (
        <FeedHint
          icon={Navigation}
          text={t('deals.feed.locationHint')}
          action={t('deals.feed.enableLocation')}
          onPress={() => { haptic(); void requestLocation(); }}
        />
      )}
      {tab === 'nearby' && !!suggestedCity && (
        <FeedHint
          icon={MapPin}
          text={t('deals.feed.nothingNearby')}
          action={t('deals.feed.seeCity', { city: moroccoCityLabel(suggestedCity.key, locale) })}
          onPress={() => chooseCity(suggestedCity.key)}
        />
      )}
      {cityReady && resolved && <DealAlertCard suggestedCityKey={alertCity} />}
    </>
  );

  let empty: React.ReactElement;
  if (loading) {
    empty = (
      <View style={styles.skeletons}>
        {SKELETON_ROWS.map((i) => <Skeleton key={i} width="100%" height={ms(DEAL_ROW_THUMB) + ms(20)} borderRadius={ms(16)} />)}
      </View>
    );
  } else if (loadFailed) {
    empty = (
      <RetryState withIcon message={t('deals.feed.loadError')} onRetry={() => { void refetch(); }} style={styles.retry} />
    );
  } else {
    empty = (
      <EmptyState
        icon={BadgePercent}
        title={t('deals.feed.emptyTitle')}
        hint={query
          ? t('deals.feed.emptySearch', { query })
          : filters.category ? t('deals.feed.emptyCategory') : t(`deals.feed.empty.${tab}`)}
        action={query
          ? { label: t('deals.feed.clearSearch'), onPress: closeSearch }
          : filters.category ? { label: t('deals.feed.showAllCategories'), onPress: () => chooseCategory(null) } : undefined}
      />
    );
  }

  const footer = isFetchingNextPage ? (
    <ActivityIndicator style={styles.footer} color={palette.violet} />
  ) : feed.isFetchNextPageError ? (
    <Pressable onPress={onEndReached} style={styles.footer} accessibilityRole="button">
      <Text style={[styles.endText, { color: palette.violet, fontFamily: fonts.semibold }]}>{t('common.retry')}</Text>
    </Pressable>
  ) : !hasNextPage && items.length > 6 ? (
    <Text style={[styles.endText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('deals.feed.endReached')}</Text>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + hp(10), borderBottomColor: theme.border }]}>
        {searching ? (
          <View style={styles.titleRow}>
            <SearchField
              value={searchText}
              onChangeText={setSearchText}
              placeholder={t('deals.feed.searchPlaceholder')}
              accessibilityLabel={t('deals.feed.search')}
              maxLength={DEAL_SEARCH_MAX}
              autoFocus
              style={styles.search}
            />
            <Pressable
              onPress={closeSearch}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('deals.feed.closeSearch')}
            >
              <X size={ms(18)} color={theme.text} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={1}>
            {t('deals.title')}
          </Text>
          <Pressable
            onPress={() => { haptic(); setSearching(true); }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('deals.feed.search')}
          >
            <Search size={ms(18)} color={theme.text} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => { haptic(); setCitySheet(true); }}
            style={({ pressed }) => [styles.cityChip, { backgroundColor: theme.bgCard, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('deals.feed.cityA11y', { city: cityLabel })}
          >
            {cityKey || !coords ? <MapPin size={ms(14)} color={palette.violet} strokeWidth={2} /> : <Navigation size={ms(14)} color={palette.violet} strokeWidth={2} />}
            <Text style={[styles.cityText, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{cityLabel}</Text>
            <ChevronDown size={ms(14)} color={theme.textMuted} strokeWidth={2} />
          </Pressable>
        </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabs, { borderBottomColor: theme.border }]}
          contentContainerStyle={styles.tabsContent}
          accessibilityRole="tablist"
        >
          {DEAL_FEED_TABS.map((key) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => { if (!active) chooseTab(key); }}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.tabText, { color: active ? theme.text : theme.textMuted, fontFamily: active ? fonts.semibold : fonts.medium }]}
                  numberOfLines={1}
                >
                  {t(`deals.tabs.${key}`)}
                </Text>
                <View style={[styles.tabIndicator, active && { backgroundColor: theme.text }]} />
              </Pressable>
            );
          })}
        </ScrollView>

        {filterable && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable
              onPress={toggleSort}
              style={({ pressed }) => [
                styles.catChip,
                styles.sortChip,
                sort === 'discount'
                  ? { backgroundColor: theme.primaryBg, borderColor: theme.primary }
                  : { backgroundColor: theme.bgCard, borderColor: theme.border },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === 'discount' }}
            >
              <BadgePercent size={ms(14)} color={sort === 'discount' ? theme.primary : theme.textSecondary} strokeWidth={2} />
              <Text style={[styles.catText, { color: sort === 'discount' ? theme.primary : theme.text, fontFamily: sort === 'discount' ? fonts.semibold : fonts.medium }]}>
                {t('deals.feed.sortDiscount')}
              </Text>
            </Pressable>
            {categoryChips.length > 0 && [null, ...categoryChips.map((c) => c.id)].map((id) => {
              const active = category === id;
              return (
                <Pressable
                  key={id ?? 'all'}
                  onPress={() => { if (!active) chooseCategory(id); }}
                  style={({ pressed }) => [
                    styles.catChip,
                    active
                      ? { backgroundColor: palette.violet, borderColor: palette.violet }
                      : { backgroundColor: theme.bgCard, borderColor: theme.border },
                    pressed && !active && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.catText, { color: active ? '#FFFFFF' : theme.text, fontFamily: active ? fonts.semibold : fonts.medium }]}>
                    {id ? t(`categories.${id}`) : t('deals.feed.allCategories')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={loading || loadFailed ? [] : items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={[styles.list, { paddingBottom: hp(130) + insets.bottom }]}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} colors={[theme.primary]} />
        }
      />

      <ActionSheet
        visible={citySheet}
        title={t('deals.city.title')}
        options={cityOptions}
        cancelLabel={t('common.cancel')}
        onClose={() => setCitySheet(false)}
      />
    </View>
  );
}

/** One-line notice above the list with a single action (enable the location, switch to a city). */
function FeedHint({ icon: Icon, text, action, onPress }: { icon: LucideIcon; text: string; action: string; onPress: () => void }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <View style={[styles.hint, { backgroundColor: theme.primaryBg, borderColor: `${palette.violet}30` }]}>
      <Icon size={ms(16)} color={palette.violet} strokeWidth={2} />
      <Text style={[styles.hintText, { color: theme.text, fontFamily: fonts.regular }]}>{text}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.hintBtn, { backgroundColor: palette.violet, opacity: pressed ? 0.8 : 1 }]}
        accessibilityRole="button"
      >
        <Text style={[styles.hintBtnText, { fontFamily: fonts.semibold }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const keyExtractor = (deal: ClientDealSummary) => deal.id;
const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: wp(20) },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: ms(46), gap: wp(10) },
  title: { flex: 1, fontSize: fontSize['3xl'], letterSpacing: -0.6 },
  cityChip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5), maxWidth: wp(170),
    paddingHorizontal: wp(12), height: ms(36), borderRadius: ms(18), borderWidth: 1,
  },
  cityText: { flexShrink: 1, fontSize: ms(13) },
  iconBtn: { width: ms(36), height: ms(36), borderRadius: ms(18), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: wp(5) },
  tabs: { flexGrow: 0, marginHorizontal: -wp(20), borderBottomWidth: StyleSheet.hairlineWidth },
  tabsContent: { flexGrow: 1, paddingHorizontal: wp(8) },
  tab: { flexGrow: 1, height: ms(44), paddingHorizontal: wp(12), alignItems: 'center', justifyContent: 'flex-end' },
  tabText: { fontSize: ms(14), marginBottom: hp(10) },
  tabIndicator: { alignSelf: 'stretch', height: 2 },
  chips: { gap: wp(8), paddingTop: hp(12), paddingBottom: hp(2) },
  catChip: { paddingHorizontal: wp(14), height: ms(34), justifyContent: 'center', borderRadius: ms(17), borderWidth: StyleSheet.hairlineWidth },
  catText: { fontSize: ms(13) },
  pressed: { opacity: 0.7 },
  list: { paddingHorizontal: wp(16), paddingTop: hp(12), flexGrow: 1 },
  separator: { height: hp(10) },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10), padding: ms(12), borderRadius: ms(14),
    borderWidth: StyleSheet.hairlineWidth, marginBottom: hp(12),
  },
  hintText: { flex: 1, fontSize: ms(13), lineHeight: ms(18) },
  hintBtn: { paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: ms(12) },
  hintBtnText: { color: '#FFFFFF', fontSize: ms(12) },
  skeletons: { gap: hp(10) },
  retry: { flex: 1, justifyContent: 'center', paddingHorizontal: wp(24), paddingVertical: hp(40) },
  footer: { paddingVertical: hp(16) },
  endText: { textAlign: 'center', fontSize: ms(12), paddingVertical: hp(16) },
});
