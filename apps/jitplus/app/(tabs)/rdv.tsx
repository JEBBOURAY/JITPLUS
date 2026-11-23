import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  View, SectionList, RefreshControl, Pressable, ScrollView, StyleSheet, Keyboard,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, CalendarSearch, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import EmptyState from '@/components/EmptyState';
import MerchantLogo from '@/components/MerchantLogo';
import RetryState from '@/components/RetryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import SearchField from '@/components/SearchField';
import Skeleton from '@/components/Skeleton';
import UpcomingBookings from '@/components/booking/UpcomingBookings';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBookingSearch, useClientBookings } from '@/hooks/useBookingHooks';
import { useKnownLocation } from '@/hooks/useKnownLocation';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useScrolledHeader } from '@/hooks/useScrolledHeader';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { formatDistance } from '@/utils/distance';
import { DIR_FLIP } from '@/utils/rtl';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { pluralKey } from '@jitplus/shared';
import { formatMoney } from '@jitplus/shared/src/currency';
import {
  bookingChips, filterBookingShops, formatDuration,
  type BookingSearchShop, type ClientBooking,
} from '@jitplus/shared/src/booking';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

/** Services listed under a shop before "+ N autres prestations". */
const SERVICES_PREVIEW = 3;
const NO_BOOKINGS: ClientBooking[] = [];
const NO_SHOPS: BookingSearchShop[] = [];

type Section = { key: 'mine' | 'others'; title: string; data: BookingSearchShop[] };

// ── One shop and its services ──────────────────────────────────────────────

const ShopCard = memo(function ShopCard({ shop, onOpenShop, onBook }: {
  shop: BookingSearchShop;
  onOpenShop: (merchantId: string) => void;
  onBook: (merchantId: string, serviceId?: string) => void;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const accent = theme.primary;
  const services = shop.services.slice(0, SERVICES_PREVIEW);
  const more = shop.services.length - services.length;
  const meta = [
    t(`categories.${shop.categorie}`, { defaultValue: '' }),
    shop.distanceKm != null ? formatDistance(shop.distanceKm) : shop.ville,
  ].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      {/* Shop: opens its page */}
      <Pressable
        onPress={() => { haptic(); onOpenShop(shop.merchantId); }}
        style={({ pressed }) => [styles.shopRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={[shop.nom, meta].filter(Boolean).join(', ')}
      >
        <View style={[styles.logoWrap, { borderColor: theme.border }]}>
          <MerchantLogo logoUrl={shop.logoUrl} merchantName={shop.nom} style={styles.logo} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.shopName, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{shop.nom}</Text>
          {!!meta && (
            <Text style={[styles.meta, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>{meta}</Text>
          )}
        </View>
        <ChevronRight size={ms(16)} color={theme.textMuted} strokeWidth={1.75} style={DIR_FLIP} />
      </Pressable>

      {/* Services: one clear action each */}
      {services.map((s) => {
        const details = [
          formatDuration(s.durationMin, t),
          s.priceFrom != null ? t('booking.priceFrom', { price: formatMoney(s.priceFrom, shop.currency, locale) }) : null,
        ].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={s.id}
            onPress={() => { haptic(); onBook(shop.merchantId, s.id); }}
            style={({ pressed }) => [styles.serviceRow, { borderTopColor: theme.border }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${t('booking.bookCta')}, ${s.nom}, ${details}, ${shop.nom}`}
          >
            <View style={styles.flex}>
              <Text style={[styles.serviceName, { color: theme.text, fontFamily: fonts.medium }]} numberOfLines={1}>{s.nom}</Text>
              <Text style={[styles.meta, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>{details}</Text>
            </View>
            <View style={[styles.bookPill, { backgroundColor: theme.primaryBg }]}>
              <Text style={[styles.bookPillText, { color: accent, fontFamily: fonts.semibold }]} numberOfLines={1}>
                {t('booking.bookCta')}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {more > 0 && (
        <Pressable
          onPress={() => { haptic(); onBook(shop.merchantId); }}
          style={({ pressed }) => [styles.moreRow, { borderTopColor: theme.border }, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={[styles.more, { color: accent, fontFamily: fonts.semibold }]}>
            {t(pluralKey('booking.moreServices', more, locale), { count: more })}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

/** Loading placeholder shaped like a ShopCard, so nothing jumps when the list arrives. */
function ShopCardSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={styles.shopRow}>
        <Skeleton width={ms(48)} height={ms(48)} borderRadius={radius.md} />
        <View style={[styles.flex, styles.skeletonLines]}>
          <Skeleton width="60%" height={hp(14)} borderRadius={radius.sm} />
          <Skeleton width="35%" height={hp(11)} borderRadius={radius.sm} />
        </View>
      </View>
      {[0, 1].map((i) => (
        <View key={i} style={[styles.serviceRow, { borderTopColor: theme.border }]}>
          <View style={[styles.flex, styles.skeletonLines]}>
            <Skeleton width="50%" height={hp(13)} borderRadius={radius.sm} />
            <Skeleton width="40%" height={hp(11)} borderRadius={radius.sm} />
          </View>
          <Skeleton width={wp(84)} height={ms(36)} borderRadius={radius.full} />
        </View>
      ))}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

/**
 * "Rendez-vous" tab: find a service and book it. The client's own shops (with a
 * loyalty card) come first, then the nearest. The search and the chips filter
 * the loaded list on the spot; they stay pinned while the list scrolls.
 */
export default function RdvScreen() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useAuth();
  const signedIn = !!client;
  const accent = theme.primary;

  const coords = useKnownLocation();
  const search = useBookingSearch(coords, signedIn);
  const upcoming = useClientBookings('upcoming', signedIn);
  const shops = search.data?.shops ?? NO_SHOPS;
  const upcomingList = upcoming.data ?? NO_BOOKINGS;

  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<string | null>(null);
  const { isScrolled, onScroll } = useScrolledHeader();
  // Typing stays fluid: the list filters with the latest text once the frame is free.
  const deferredQuery = useDeferredValue(query);
  // Tabs stay mounted: without this the search keyboard stays open over the next tab.
  useFocusEffect(useCallback(() => () => Keyboard.dismiss(), []));

  const chips = useMemo(() => bookingChips(shops), [shops]);
  // A chip that left the list (refetch, new position) no longer filters: it
  // can't be seen any more, so it couldn't be cleared either.
  const activeChip = chip && chips.some((c) => c.key === chip) ? chip : null;
  const filtered = useMemo(() => filterBookingShops(shops, deferredQuery, activeChip), [shops, deferredQuery, activeChip]);
  const isFiltering = !!deferredQuery.trim() || !!activeChip;

  const sections = useMemo<Section[]>(() => {
    const mine = filtered.filter((s) => s.hasCard);
    const others = filtered.filter((s) => !s.hasCard);
    const out: Section[] = [];
    if (mine.length) out.push({ key: 'mine', title: t('booking.yourShops'), data: mine });
    if (others.length) {
      // "À proximité" only when distances are known; otherwise a neutral title.
      const title = others.some((s) => s.distanceKm != null) ? t('booking.nearby') : t('booking.otherShops');
      out.push({ key: 'others', title, data: others });
    }
    return out;
  }, [filtered, t]);

  const openShop = useCallback((merchantId: string) => {
    router.push({ pathname: '/merchant/[id]', params: { id: merchantId } });
  }, [router]);
  const book = useCallback((merchantId: string, serviceId?: string) => {
    router.push({ pathname: '/book/[merchantId]', params: { merchantId, ...(serviceId && { serviceId }) } });
  }, [router]);

  const selectChip = useCallback((key: string | null) => {
    haptic();
    setChip((current) => (current === key ? null : key));
  }, []);
  const clearQuery = useCallback(() => setQuery(''), []);

  const pull = usePullToRefresh(async () => {
    haptic();
    await Promise.all([search.refetch(), signedIn ? upcoming.refetch() : undefined]);
  });

  const renderItem = useCallback(
    ({ item }: { item: BookingSearchShop }) => <ShopCard shop={item} onOpenShop={openShop} onBook={book} />,
    [openShop, book],
  );
  const renderSectionHeader = useCallback(({ section }: { section: Section }) => (
    <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
      {section.title}
    </Text>
  ), [theme.text, fonts.bold]);
  const keyExtractor = useCallback((s: BookingSearchShop) => s.merchantId, []);
  const openMyBookings = useCallback(() => { haptic(); router.push('/bookings'); }, [router]);

  // Hidden while searching: the client is looking for something new.
  const listHeader = useMemo(
    () => (!isFiltering && upcomingList.length > 0 ? <UpcomingBookings bookings={upcomingList} max={1} /> : null),
    [isFiltering, upcomingList],
  );

  const listEmpty = useMemo(() => {
    if (search.isLoading) {
      return (
        <View style={styles.skeletons}>
          <Skeleton width="45%" height={hp(16)} borderRadius={radius.sm} />
          <ShopCardSkeleton />
          <ShopCardSkeleton />
        </View>
      );
    }
    if (search.isError) {
      return (
        <RetryState
          message={t('booking.searchError')}
          onRetry={() => { haptic(); search.refetch(); }}
          style={styles.empty}
        />
      );
    }
    return (
      <EmptyState
        icon={CalendarSearch}
        title={isFiltering ? t('booking.searchEmpty') : t('booking.noShops')}
        hint={isFiltering ? t('booking.searchEmptyHint') : t('booking.noShopsHint')}
        style={styles.empty}
      />
    );
  }, [search.isLoading, search.isError, search.refetch, isFiltering, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header: title, search and service chips stay pinned ── */}
      <ScreenHeader isScrolled={isScrolled} style={styles.headerGutter}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={1}>
            {t('booking.tabTitle')}
          </Text>
          {/* Always reachable, even with nothing upcoming: past bookings live there too. */}
          {signedIn && (
            <Pressable
              onPress={openMyBookings}
              hitSlop={8}
              style={({ pressed }) => [styles.myBookings, { backgroundColor: theme.primaryBg }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('booking.myBookings')}
            >
              <CalendarClock size={ms(16)} color={accent} strokeWidth={1.75} />
              <Text style={[styles.myBookingsText, { color: accent, fontFamily: fonts.semibold }]} numberOfLines={1}>
                {t('booking.myBookings')}
              </Text>
            </Pressable>
          )}
        </View>

        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t('booking.searchPlaceholder')}
          onSubmitEditing={Keyboard.dismiss}
          onClear={clearQuery}
          clearLabel={t('booking.clearSearch')}
          style={styles.search}
        />

        {chips.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipsScroll}
            keyboardShouldPersistTaps="handled"
          >
            {[{ key: null as string | null, label: t('booking.chipAll') }, ...chips].map(({ key, label }) => {
              const selected = activeChip === key;
              return (
                <Pressable
                  key={key ?? 'all'}
                  onPress={() => selectChip(key)}
                  style={({ pressed }) => [
                    styles.chip,
                    // Same selected state as the deals chips: violet tint, never a black fill.
                    selected
                      ? { backgroundColor: theme.primaryBg, borderColor: accent }
                      : { backgroundColor: theme.bgCard, borderColor: theme.border },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[styles.chipText, { color: selected ? accent : theme.text, fontFamily: selected ? fonts.semibold : fonts.medium }]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </ScreenHeader>

      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: hp(130) + insets.bottom }} />}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh}
            tintColor={theme.primaryLight} colors={[theme.primary]} progressBackgroundColor={theme.bgCard} />
        }
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={6}
        windowSize={9}
      />
    </View>
  );
}

// Spacing on the page grid: 16 gutter, 8/12 inside a group, 24 between groups.
const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },

  headerGutter: { paddingHorizontal: wp(16) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: ms(46) },
  myBookings: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.full },
  myBookingsText: { fontSize: fontSize.sm },
  title: { flex: 1, fontSize: fontSize['3xl'], letterSpacing: -0.6 },
  search: { marginTop: hp(12) },
  chipsScroll: { marginHorizontal: -wp(16), marginTop: hp(12), flexGrow: 0 },
  chips: { gap: wp(8), paddingHorizontal: wp(16) },
  chip: { height: ms(36), paddingHorizontal: wp(14), borderRadius: radius.full, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: fontSize.sm },

  content: { paddingHorizontal: wp(16), flexGrow: 1 },
  sectionTitle: { fontSize: fontSize.lg, letterSpacing: -0.2, marginTop: hp(24), marginBottom: hp(12) },

  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: hp(12), paddingHorizontal: wp(16) },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: wp(12), paddingVertical: hp(14) },
  logoWrap: {
    width: ms(48), height: ms(48), borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', backgroundColor: '#FFFFFF',
  },
  logo: { width: '100%', height: '100%' },
  shopName: { fontSize: fontSize.md },
  meta: { fontSize: fontSize.sm, marginTop: hp(2) },
  serviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12), minHeight: ms(56),
    paddingVertical: hp(10), borderTopWidth: StyleSheet.hairlineWidth,
  },
  serviceName: { fontSize: fontSize.md },
  bookPill: { height: ms(36), paddingHorizontal: wp(14), borderRadius: radius.full, justifyContent: 'center' },
  bookPillText: { fontSize: fontSize.sm },
  moreRow: { minHeight: ms(48), justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  more: { fontSize: fontSize.sm },

  skeletons: { gap: hp(12), marginTop: hp(24) },
  skeletonLines: { gap: hp(8) },
  // Top of the list, not centred: the pinned header already fills the top of the screen.
  empty: { flex: 0, justifyContent: 'flex-start', paddingHorizontal: wp(24), paddingTop: hp(48), paddingBottom: 0 },
});
