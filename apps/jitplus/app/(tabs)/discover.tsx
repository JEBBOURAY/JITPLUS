import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, FlatList, Pressable,
  Platform, TouchableOpacity, Linking, Keyboard,
  useWindowDimensions, Alert,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, MapPin, X, LocateFixed, SlidersHorizontal, List } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Merchant } from '@/types';
import SafeMapView, { MAPS_AVAILABLE } from '@/components/SafeMapView';
import StarLoader from '@/components/StarLoader';
import { getDistanceKm } from '@/utils/distance';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import { useMerchants } from '@/hooks/useQueryHooks';
import { prefetchImages } from '@/utils/imageCache';
import { COMPACT_SCREEN_HEIGHT } from '@/constants';
import {
  FallbackMerchantCard, MerchantCallout, discoverStyles as styles,
  MerchantPin, ClusterPin, MAP_STYLE, DEFAULT_REGION, MerchantListSheet, SearchResults,
} from '@/components/discover';
import { useDiscoverMap } from '@/hooks/useDiscoverMap';
import { isEntityId } from '@/utils/ids';
import { pointKey, pointName } from '@/utils/merchantPoint';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const MAX_PREFETCHED_LOGOS = 30;
/** Stable while loading: a fresh `[]` each render would re-run every memo of the map. */
const NO_MERCHANTS: Merchant[] = [];


/** Sizes of the floating UI, normal vs. very compact screens. Built once per layout. */
function buildSizes(compact: boolean) {
  const btn = compact ? ms(42) : ms(48);
  return {
    gutter: compact ? wp(12) : wp(16),
    roundBtn: { width: btn, height: btn, borderRadius: btn / 2 },
    btnHeight: btn,
    icon: compact ? ms(18) : ms(20),
    smallIcon: compact ? ms(12) : ms(13),
    text: compact ? FS.xs : FS.sm,
    searchBar: { height: compact ? ms(46) : ms(52), paddingHorizontal: compact ? wp(14) : wp(18) },
    searchIcon: compact ? ms(16) : ms(18),
    searchText: compact ? FS.sm : FS.md,
    closePill: compact ? { width: ms(26), height: ms(26), borderRadius: ms(13) } : { width: ms(30), height: ms(30), borderRadius: ms(15) },
    closeIcon: compact ? ms(12) : ms(14),
    counter: { paddingHorizontal: compact ? wp(12) : wp(16), paddingVertical: compact ? hp(7) : hp(10) },
    filterScroll: { paddingHorizontal: compact ? wp(12) : wp(16), paddingVertical: compact ? hp(2) : hp(4), gap: compact ? wp(4) : wp(6) },
    chip: { paddingHorizontal: compact ? wp(10) : wp(14), paddingVertical: compact ? hp(6) : hp(8), borderRadius: compact ? ms(16) : ms(20) },
    chipIcon: compact ? ms(11) : ms(13),
    chipText: compact ? ms(10.5) : FS.xs,
    topBarOffset: compact ? ms(6) : ms(10),
    filterOffset: compact ? ms(54) : ms(64),
    calloutOffset: compact ? ms(54) : ms(60),
    filterBarHeight: compact ? ms(48) : ms(54),
    bottom: compact ? ms(84) : ms(100),
    fallbackTop: compact ? ms(94) : ms(110),
    fallbackBottom: compact ? ms(116) : ms(140),
  };
}

export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { client, isGuest } = useAuth();
  const { t, locale } = useLanguage();
  const isVeryCompact = screenHeight < COMPACT_SCREEN_HEIGHT;
  const ui = useMemo(() => buildSizes(isVeryCompact), [isVeryCompact]);

  const { data: merchants = NO_MERCHANTS, isLoading, isError, isStale, isFetching, refetch } = useMerchants(client?.id ?? 'guest', !!client || isGuest);
  // The tab stays mounted: refresh the list (and its deal badges) when the user
  // comes back to it, and only then. Read through a ref: with isStale in the
  // callback's deps, it also re-ran when the stale timer fired on screen (a
  // 20-page reload every 5 min) and right after a failed first load.
  const freshnessRef = useRef({ isStale, isFetching });
  useEffect(() => { freshnessRef.current = { isStale, isFetching }; }, [isStale, isFetching]);
  useFocusEffect(useCallback(() => {
    const { isStale: stale, isFetching: fetching } = freshnessRef.current;
    // cancelRefetch: false joins a load already running instead of restarting it.
    if (stale && !fetching) refetch({ cancelRefetch: false });
  }, [refetch]));
  // With a list already on screen, a failed refresh keeps it: the error card is
  // only for a first load that failed.
  const showLoadError = isError && !isLoading && merchants.length === 0;
  // React Query keeps status 'error' (isLoading false) while a retry runs: show the loader then.
  const retrying = showLoadError && isFetching;
  const showLoader = isLoading || retrying;
  const retry = useCallback(() => { refetch(); }, [refetch]);

  const {
    searchQuery, setSearchQuery, debouncedSearch, searchResults, searchResultCount, showSearch, toggleSearch, openSearchResults,
    selectedCategory, categories, showFilters, toggleFilters, handleCategoryPress, resetFilters, activeFilterCount,
    mappableMerchants, mappableMerchantCount, sortedMappableMerchants, mapItems,
    mapRef, mapReady, userLocation, handleMapReady, handleRegionChange, handleMapPress, handleClusterPress, centerOnUser,
    selectedMerchant, selectedMerchantDistance, selectMerchant,
    listSheet, listMerchants, areaCount, openAreaList, closeList, selectFromList,
  } = useDiscoverMap(merchants);

  // Warm the logos shown by the callout on tap, only for the pins on screen.
  useEffect(() => {
    const visible: (string | null | undefined)[] = [];
    for (const item of mapItems) {
      if (item.type !== 'cluster') visible.push(item.merchant.logoUrl);
      if (visible.length >= MAX_PREFETCHED_LOGOS) break;
    }
    if (visible.length > 0) prefetchImages(visible);
  }, [mapItems]);

  const handleMerchantPress = useCallback((merchant: Merchant) => {
    haptic(HapticStyle.Medium);
    router.push({ pathname: '/merchant/[id]', params: { id: merchant.id } });
  }, [router]);

  // Guests get the count only (topDeal is null for them): the deal itself needs an account.
  const handleDealPress = useCallback((merchant: Merchant) => {
    haptic();
    if (!client) {
      Alert.alert(t('guest.loginRequired'), t('guest.loginRequiredDesc'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('welcome.createAccount'), onPress: () => router.push('/register') },
        { text: t('welcome.login'), onPress: () => router.push('/login') },
      ], { cancelable: true });
      return;
    }
    const dealId = merchant.topDeal?.id;
    if (isEntityId(dealId)) router.push({ pathname: '/deal/[id]', params: { id: dealId } });
    else router.push({ pathname: '/merchant/[id]', params: { id: merchant.id } });
  }, [client, router, t]);

  const openInMaps = useCallback((m: Merchant) => {
    if (m.latitude == null || m.longitude == null) return;
    const label = encodeURIComponent(pointName(m));
    const web = `https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`;
    const url = Platform.select({
      ios: `maps://app?daddr=${m.latitude},${m.longitude}&q=${label}`,
      android: `google.navigation:q=${m.latitude},${m.longitude}&label=${label}`,
      default: web,
    });
    Linking.openURL(url).catch(() => { Linking.openURL(web).catch(() => {}); });
  }, []);

  // A list row or search result: on the map when it has a position, else its page.
  const handlePickMerchant = useCallback((m: Merchant) => {
    if (!MAPS_AVAILABLE || m.latitude == null || m.longitude == null) handleMerchantPress(m);
    else selectFromList(m);
  }, [handleMerchantPress, selectFromList]);

  const renderFallbackItem = useCallback(({ item: m }: { item: Merchant }) => {
    const dist = userLocation ? getDistanceKm(userLocation.latitude, userLocation.longitude, m.latitude!, m.longitude!) : null;
    return <FallbackMerchantCard merchant={m} distance={dist} onPress={handleMerchantPress} onNavigate={openInMaps} />;
  }, [userLocation, handleMerchantPress, openInMaps]);

  const topBarTop = insets.top + ui.topBarOffset;
  const filterTop = insets.top + ui.filterOffset;
  const calloutTop = insets.top + ui.calloutOffset + (showFilters ? ui.filterBarHeight : 0);
  // Without a map the list behind is already filtered live: no dropdown (its
  // "see all" sheet and preview card only exist on the map).
  const showDropdown = MAPS_AVAILABLE && showSearch && debouncedSearch.trim().length >= 2;
  const hasFilter = !!searchQuery || selectedCategory !== 'all';

  const countText = (key: string, count: number) => t(pluralKey(key, count, locale), { count });
  const listTitle = !listSheet ? '' : countText(
    listSheet.mode === 'area' ? 'discover.areaListTitle'
      : listSheet.mode === 'spot' ? 'discover.sameSpotTitle' : 'discover.searchListTitle',
    listMerchants.length,
  );

  return (
    <View style={styles.container}>
      {MAPS_AVAILABLE ? (
        <SafeMapView
          ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={DEFAULT_REGION}
          showsUserLocation showsMyLocationButton={false} showsCompass={false}
          showsPointsOfInterests={false} showsBuildings={false} showsIndoors={false} showsTraffic={false}
          customMapStyle={MAP_STYLE} onMapReady={handleMapReady} onRegionChangeComplete={handleRegionChange} onPress={handleMapPress}
        >
          {mapItems.map((item) => (item.type === 'cluster' ? (
            <ClusterPin key={item.id} count={item.count} latitude={item.latitude} longitude={item.longitude}
              expansionZoom={item.expansionZoom} clusterId={item.clusterId} onPress={handleClusterPress} />
          ) : (
            <MerchantPin key={item.id} merchant={item.merchant}
              latitude={item.latitude} longitude={item.longitude} onPress={selectMerchant} />
          )))}
        </SafeMapView>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]}>
          <FlatList
            data={sortedMappableMerchants} keyExtractor={pointKey} renderItem={renderFallbackItem}
            contentContainerStyle={[styles.fallbackList, { paddingTop: insets.top + ui.fallbackTop, paddingBottom: ui.fallbackBottom }]}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}
            removeClippedSubviews={Platform.OS === 'android'} maxToRenderPerBatch={10} windowSize={5} initialNumToRender={8}
            ListEmptyComponent={showLoader ? (
              <View style={styles.emptyState}><StarLoader size={88} /></View>
            ) : (
              <View style={styles.emptyState}>
                <View style={localStyles.fallbackIcon}>
                  <MapPin size={ms(36)} color={palette.gold} strokeWidth={1.5} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>{showLoadError ? t('discover.loadErrorTitle') : t('discover.noMerchantFound')}</Text>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>{showLoadError ? t('discover.loadErrorBody') : debouncedSearch ? t('discover.noResultsFor', { query: debouncedSearch }) : t('discover.noGeoMerchant')}</Text>
                {showLoadError && (
                  <TouchableOpacity onPress={retry} activeOpacity={0.7} hitSlop={8} accessibilityRole="button" style={localStyles.textAction}>
                    <Text style={[styles.emptyText, localStyles.actionText]}>{t('common.retry')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </View>
      )}

      {/* Floating UI */}
      <View style={[styles.topBar, { top: topBarTop, paddingHorizontal: ui.gutter }]} pointerEvents="box-none">
        {showSearch ? (
          <>
            <View style={[styles.searchBarExpanded, ui.searchBar, { backgroundColor: theme.bgCard }]}>
              <Search size={ui.searchIcon} color={theme.textMuted} strokeWidth={2} />
              <TextInput style={[styles.searchInput, { color: theme.text, fontSize: ui.searchText }]} placeholder={t('discover.searchPlaceholder')} placeholderTextColor={theme.inputPlaceholder} value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search" autoFocus />
              <Pressable onPress={toggleSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <View style={[styles.closePill, ui.closePill, { backgroundColor: theme.bgInput }]}>
                  <X size={ui.closeIcon} color={theme.textMuted} strokeWidth={2} />
                </View>
              </Pressable>
            </View>
            {showDropdown && (
              <SearchResults query={debouncedSearch} results={searchResults} totalCount={searchResultCount}
                onSelect={handlePickMerchant} onSeeAll={openSearchResults} />
            )}
          </>
        ) : (
          <View style={styles.topButtons}>
            <TouchableOpacity style={[styles.floatingBtn, ui.roundBtn, { backgroundColor: theme.bgCard }]} activeOpacity={0.8} onPress={toggleSearch} accessibilityRole="button" accessibilityLabel={t('discover.searchPlaceholder')}>
              <Search size={ui.icon} color={theme.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.counterBadge, ui.counter, { backgroundColor: theme.bgCard }]}>
              <MapPin size={ui.smallIcon} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.counterText, { color: theme.text, fontSize: ui.text }]}>{countText('discover.merchantCount', mappableMerchantCount)}</Text>
            </View>
            <TouchableOpacity style={[styles.floatingBtn, ui.roundBtn, { backgroundColor: showFilters ? palette.violet : theme.bgCard }]} activeOpacity={0.8} onPress={toggleFilters} accessibilityRole="button" accessibilityLabel={t('discover.filters')} accessibilityState={{ expanded: showFilters }}>
              <SlidersHorizontal size={ui.icon} color={showFilters ? '#fff' : theme.text} strokeWidth={2} />
              {activeFilterCount > 0 && <View style={styles.filterDot} />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {showFilters && (
        <View style={[styles.filterBar, { top: filterTop }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.filterScroll}>
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const Icon = cat.icon;
              return (
                <Pressable key={cat.id} onPress={() => handleCategoryPress(cat.id)} accessibilityRole="button" accessibilityState={{ selected: isActive }}>
                  <View style={[styles.chip, ui.chip, isActive ? localStyles.chipActive : { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                    <Icon size={ui.chipIcon} color={isActive ? '#fff' : theme.textMuted} strokeWidth={2} />
                    <Text style={[styles.chipLabel, { color: isActive ? '#fff' : theme.text, fontSize: ui.chipText }]}>{t(cat.labelKey)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {MAPS_AVAILABLE && !listSheet && (
        <TouchableOpacity style={[styles.locateBtn, ui.roundBtn, { backgroundColor: theme.bgCard, bottom: ui.bottom, right: ui.gutter }]} activeOpacity={0.8} onPress={centerOnUser} accessibilityRole="button" accessibilityLabel={userLocation ? t('discover.locateMe') : t('discover.locationPromptTitle')}>
          <LocateFixed size={ui.icon} color={userLocation ? palette.violet : theme.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      )}

      {/* Area list entry: the merchants of the visible part of the map */}
      {MAPS_AVAILABLE && !listSheet && mappableMerchants.length > 0 && (
        <View style={[localStyles.pillWrap, { bottom: ui.bottom }]} pointerEvents="box-none">
          <TouchableOpacity
            style={[localStyles.pill, { backgroundColor: theme.bgCard, height: ui.btnHeight }]}
            activeOpacity={0.8} onPress={openAreaList}
            accessibilityRole="button"
            accessibilityLabel={countText('discover.areaListTitle', areaCount)}
          >
            <List size={ui.searchIcon} color={palette.violet} strokeWidth={2} />
            <Text style={[localStyles.pillText, { color: theme.text, fontSize: ui.text }]} numberOfLines={1}>
              {t('discover.inArea', { count: areaCount })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {MAPS_AVAILABLE && listSheet && (
        <MerchantListSheet
          title={listTitle}
          merchants={listMerchants}
          userLocation={userLocation}
          emptyText={t(listSheet.mode === 'area' ? 'discover.areaListEmpty' : 'discover.noMerchantFound')}
          onSelect={handlePickMerchant} onClose={closeList}
          bottom={ui.bottom} maxHeight={screenHeight * 0.5}
        />
      )}

      {MAPS_AVAILABLE && selectedMerchant && (
        <MerchantCallout key={pointKey(selectedMerchant)} merchant={selectedMerchant} distance={selectedMerchantDistance}
          onPress={handleMerchantPress} onNavigate={openInMaps} onDealPress={handleDealPress}
          style={{ top: calloutTop, left: ui.gutter, right: ui.gutter }} />
      )}

      {showLoader && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
            <StarLoader size={88} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.searching')}</Text>
          </View>
        </View>
      )}

      {showLoadError && !retrying && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <TouchableOpacity style={[styles.emptyCard, { backgroundColor: theme.bgCard }]} activeOpacity={0.7} onPress={retry} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.loadErrorTitle')}</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('discover.loadErrorBody')}</Text>
            <Text style={[styles.emptyText, { color: palette.violet }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Hidden while the dropdown lists the matches (some may have no position). */}
      {mappableMerchants.length === 0 && !showDropdown && !showLoader && !showLoadError && mapReady && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {debouncedSearch ? t('discover.noResultsFor', { query: debouncedSearch }) : selectedCategory !== 'all' ? t('discover.noCategoryMerchant') : t('discover.noPositionMerchant')}
            </Text>
            {hasFilter && (
              <TouchableOpacity onPress={resetFilters} activeOpacity={0.7} hitSlop={8} accessibilityRole="button" style={localStyles.textAction}>
                <Text style={[styles.emptyText, localStyles.actionText]}>{t('discover.resetFilters')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: ms(8), paddingHorizontal: ms(18), borderRadius: ms(24), maxWidth: '60%',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10 }, android: { elevation: 4 } }),
  },
  pillText: { fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  chipActive: { backgroundColor: palette.violet, borderColor: palette.violet },
  fallbackIcon: {
    width: ms(88), height: ms(88), borderRadius: ms(24), backgroundColor: `${palette.gold}15`,
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(16),
  },
  textAction: { marginTop: hp(10) },
  actionText: { color: palette.violet, fontWeight: '700' },
});
