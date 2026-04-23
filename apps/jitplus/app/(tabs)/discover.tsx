import { useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, FlatList, Pressable,
  Platform, TouchableOpacity, Linking, Keyboard, I18nManager,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Search, MapPin, X, ChevronRight,
  LocateFixed, SlidersHorizontal,
} from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Merchant } from '@/types';
import FadeInView from '@/components/FadeInView';
import SafeMapView, { MAPS_AVAILABLE } from '@/components/SafeMapView';
import { CATEGORIES, getCategoryEmoji } from '@/utils/categories';
import { getDistanceKm } from '@/utils/distance';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useAppFonts } from '@/utils/fonts';
import { useMerchants } from '@/hooks/useQueryHooks';
import { prefetchImages } from '@/utils/imageCache';
import { Image } from 'expo-image';
import { resolveImageUrl } from '@/utils/imageUrl';
import MapMarker from '@/components/MapMarker';
import ClusterMarker from '@/components/ClusterMarker';
import { COMPACT_SCREEN_HEIGHT, FOCUS_DELAY_MS } from '@/constants';
import {
  FallbackMerchantCard, MerchantCallout, discoverStyles as styles,
  TrackedMarker, MAP_STYLE, DEFAULT_REGION,
} from '@/components/discover';
import { useDiscoverMap } from '@/hooks/useDiscoverMap';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { client, isGuest } = useAuth();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const isVeryCompact = screenHeight < COMPACT_SCREEN_HEIGHT;

  const { data: merchants = [], isLoading, isError, refetch } = useMerchants(!!client || isGuest);

  useEffect(() => {
    if (merchants.length > 0) prefetchImages(merchants.map((m) => m.logoUrl).filter(Boolean));
  }, [merchants]);

  const {
    searchQuery, setSearchQuery, debouncedSearch, selectedCategory,
    showSearch, setShowSearch, showFilters, userLocation, mapReady,
    selectedMerchant, setSelectedMerchant, mapRef, searchInputRef,
    filteredMerchants, mappableMerchants, mapItems, sortedMappableMerchants,
    selectedMerchantDistance, handleRegionChange, handleCategoryPress,
    handleMarkerPress, handleClusterPress, centerOnUser, handleMapPress,
    handleMapReady, toggleSearch, toggleFilters, activeFilterCount,
  } = useDiscoverMap(merchants);

  const handleMerchantPress = useCallback((merchant: Merchant) => {
    haptic(HapticStyle.Medium);
    router.push({ pathname: '/merchant/[id]', params: { id: merchant.id } });
  }, [router]);

  const openInMaps = useCallback((m: Merchant) => {
    if (!m.latitude || !m.longitude) return;
    const label = encodeURIComponent(m.storeName || m.nomBoutique);
    const url = Platform.select({
      ios: `maps://app?daddr=${m.latitude},${m.longitude}&q=${label}`,
      android: `google.navigation:q=${m.latitude},${m.longitude}&label=${label}`,
      default: `https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`,
    });
    Linking.openURL(url!).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`);
    });
  }, []);

  const topBarTop = insets.top + (isVeryCompact ? ms(6) : ms(10));
  const filterTop = insets.top + (isVeryCompact ? ms(54) : ms(64));
  const calloutTop = insets.top + (isVeryCompact ? ms(54) : ms(60)) + (showFilters ? (isVeryCompact ? ms(48) : ms(54)) : 0);
  const locateBottom = isVeryCompact ? ms(84) : ms(100);
  const fallbackTopPadding = insets.top + (isVeryCompact ? ms(94) : ms(110));
  const fallbackBottomPadding = isVeryCompact ? ms(116) : ms(140);

  const fallbackKeyExtractor = useCallback((m: Merchant) => m.storeId ? `${m.id}-${m.storeId}` : m.id, []);

  const renderFallbackItem = useCallback(({ item: m }: { item: Merchant }) => {
    const dist = userLocation ? getDistanceKm(userLocation.latitude, userLocation.longitude, m.latitude!, m.longitude!) : null;
    return <FallbackMerchantCard merchant={m} distance={dist} onPress={handleMerchantPress} onNavigate={openInMaps} />;
  }, [userLocation, handleMerchantPress, openInMaps]);

  return (
    <View style={styles.container}>
      {MAPS_AVAILABLE ? (
        <SafeMapView
          ref={mapRef} style={StyleSheet.absoluteFillObject} initialRegion={DEFAULT_REGION}
          showsUserLocation showsMyLocationButton={false} showsCompass={false}
          showsPointsOfInterest={false} showsBuildings={false} showsIndoors={false} showsTraffic={false}
          customMapStyle={MAP_STYLE} onMapReady={handleMapReady} onRegionChangeComplete={handleRegionChange} onPress={handleMapPress}
        >
          {mapItems.map((item) => {
            if (item.type === 'cluster') {
              return (
                <TrackedMarker key={item.id} coordinate={{ latitude: item.latitude, longitude: item.longitude }} onPress={() => handleClusterPress(item.latitude, item.longitude, item.expansionZoom)} anchor={{ x: 0.5, y: 0.5 }}>
                  <ClusterMarker count={item.count} />
                </TrackedMarker>
              );
            }
            const m = item.merchant;
            return (
              <TrackedMarker key={m.storeId ? `${m.id}-${m.storeId}` : m.id} coordinate={{ latitude: item.latitude, longitude: item.longitude }} onPress={() => handleMarkerPress(m)} anchor={{ x: 0.5, y: 0.5 }}>
                <MapMarker />
              </TrackedMarker>
            );
          })}
        </SafeMapView>
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.bg }]}>
          <FlatList
            data={sortedMappableMerchants} keyExtractor={fallbackKeyExtractor} renderItem={renderFallbackItem}
            contentContainerStyle={[styles.fallbackList, { paddingTop: fallbackTopPadding, paddingBottom: fallbackBottomPadding }]}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}
            removeClippedSubviews={Platform.OS !== 'web'} maxToRenderPerBatch={10} windowSize={5} initialNumToRender={8}
            ListEmptyComponent={!isLoading ? (
              <View style={styles.emptyState}>
                <View style={{ width: ms(88), height: ms(88), borderRadius: ms(24), backgroundColor: `${palette.gold}15`, alignItems: 'center', justifyContent: 'center', marginBottom: hp(16) }}>
                  <MapPin size={ms(36)} color={palette.gold} strokeWidth={1.5} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>{searchQuery ? t('discover.noResultsFor', { query: searchQuery }) : t('discover.noGeoMerchant')}</Text>
              </View>
            ) : null}
          />
        </View>
      )}

      {/* Floating UI */}
      <View style={[styles.topBar, { top: topBarTop, paddingHorizontal: isVeryCompact ? wp(12) : wp(16) }]} pointerEvents="box-none">
        {showSearch ? (
          <>
            <View style={[styles.searchBarExpanded, { backgroundColor: theme.bgCard, height: isVeryCompact ? ms(46) : ms(52), paddingHorizontal: isVeryCompact ? wp(14) : wp(18) }]}>
              <Search size={isVeryCompact ? ms(16) : ms(18)} color={theme.textMuted} strokeWidth={2} />
              <TextInput ref={searchInputRef} style={[styles.searchInput, { color: theme.text, fontSize: isVeryCompact ? FS.sm : FS.md }]} placeholder={t('discover.searchPlaceholder')} placeholderTextColor={theme.inputPlaceholder} value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search" autoFocus />
              <Pressable onPress={toggleSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('discover.searchPlaceholder')}>
                <View style={[styles.closePill, { backgroundColor: theme.bgInput, width: isVeryCompact ? ms(26) : ms(30), height: isVeryCompact ? ms(26) : ms(30), borderRadius: isVeryCompact ? ms(13) : ms(15) }]}>
                  <X size={isVeryCompact ? ms(12) : ms(14)} color={theme.textMuted} strokeWidth={2} />
                </View>
              </Pressable>
            </View>
            {debouncedSearch.trim().length >= 2 && filteredMerchants.length > 0 && (
              <View style={[searchResultsStyles.dropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={searchResultsStyles.scroll}>
                  {filteredMerchants.slice(0, 6).map((m) => (
                    <Pressable key={m.storeId ? `${m.id}-${m.storeId}` : m.id} onPress={() => { haptic(); setShowSearch(false); setSearchQuery(''); Keyboard.dismiss(); router.push({ pathname: '/merchant/[id]', params: { id: m.id } }); }}
                      style={({ pressed }) => [searchResultsStyles.item, { borderBottomColor: theme.border }, pressed && { backgroundColor: `${palette.violet}08` }]}>
                      {m.logoUrl ? (
                        <Image source={resolveImageUrl(m.logoUrl)} style={searchResultsStyles.logo} contentFit="cover" transition={200} />
                      ) : (
                        <View style={[searchResultsStyles.logoFallback, { backgroundColor: `${palette.violet}10` }]}>
                          <Text style={searchResultsStyles.emojiText}>{getCategoryEmoji(m.categorie)}</Text>
                        </View>
                      )}
                      <View style={searchResultsStyles.info}>
                        <Text style={[searchResultsStyles.name, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{m.storeName || m.nomBoutique}</Text>
                        {(m.ville || m.categorie) && <Text style={[searchResultsStyles.sub, { color: theme.textMuted }]} numberOfLines={1}>{[m.categorie, m.ville].filter(Boolean).join(' · ')}</Text>}
                      </View>
                      <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={2} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {debouncedSearch.trim().length >= 2 && filteredMerchants.length === 0 && (
              <View style={[searchResultsStyles.dropdown, searchResultsStyles.emptyDropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <MapPin size={ms(20)} color={theme.textMuted} strokeWidth={2} />
                <Text style={[searchResultsStyles.emptyText, { color: theme.textMuted }]}>{t('discover.noResultsFor', { query: debouncedSearch })}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.topButtons}>
            <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: theme.bgCard, width: isVeryCompact ? ms(42) : ms(48), height: isVeryCompact ? ms(42) : ms(48), borderRadius: isVeryCompact ? ms(21) : ms(24) }]} activeOpacity={0.8} onPress={toggleSearch} accessibilityRole="button" accessibilityLabel={t('discover.searchPlaceholder')}>
              <Search size={isVeryCompact ? ms(18) : ms(20)} color={theme.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.counterBadge, { backgroundColor: theme.bgCard, paddingHorizontal: isVeryCompact ? wp(12) : wp(16), paddingVertical: isVeryCompact ? hp(7) : hp(10) }]}>
              <MapPin size={isVeryCompact ? ms(12) : ms(13)} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.counterText, { color: theme.text, fontSize: isVeryCompact ? FS.xs : FS.sm }]}>{t('discover.merchantCount', { count: mappableMerchants.length })}</Text>
            </View>
            <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: theme.bgCard, width: isVeryCompact ? ms(42) : ms(48), height: isVeryCompact ? ms(42) : ms(48), borderRadius: isVeryCompact ? ms(21) : ms(24) }, showFilters && { backgroundColor: palette.violet }]} activeOpacity={0.8} onPress={toggleFilters} accessibilityRole="button" accessibilityState={{ expanded: showFilters }}>
              <SlidersHorizontal size={isVeryCompact ? ms(18) : ms(20)} color={showFilters ? '#fff' : theme.text} strokeWidth={2} />
              {activeFilterCount > 0 && <View style={styles.filterDot} />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {showFilters && (
        <View style={[styles.filterBar, { top: filterTop }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { paddingHorizontal: isVeryCompact ? wp(12) : wp(16), paddingVertical: isVeryCompact ? hp(2) : hp(4), gap: isVeryCompact ? wp(4) : wp(6) }, I18nManager.isRTL && { flexDirection: 'row-reverse' }]}>
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const Icon = cat.icon;
              return (
                <Pressable key={cat.id} onPress={() => handleCategoryPress(cat.id)} accessibilityRole="button" accessibilityState={{ selected: isActive }}>
                  <View style={[styles.chip, { paddingHorizontal: isVeryCompact ? wp(10) : wp(14), paddingVertical: isVeryCompact ? hp(6) : hp(8), borderRadius: isVeryCompact ? ms(16) : ms(20) }, isActive ? { backgroundColor: palette.violet, borderColor: palette.violet } : { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                    <Icon size={isVeryCompact ? ms(11) : ms(13)} color={isActive ? '#fff' : theme.textMuted} strokeWidth={2} />
                    <Text style={[styles.chipLabel, { color: isActive ? '#fff' : theme.text, fontSize: isVeryCompact ? ms(10.5) : FS.xs }]}>{t(cat.labelKey)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {MAPS_AVAILABLE && userLocation && (
        <TouchableOpacity style={[styles.locateBtn, { backgroundColor: theme.bgCard, bottom: locateBottom, right: isVeryCompact ? wp(12) : wp(16), width: isVeryCompact ? ms(42) : ms(48), height: isVeryCompact ? ms(42) : ms(48), borderRadius: isVeryCompact ? ms(21) : ms(24) }]} activeOpacity={0.8} onPress={centerOnUser} accessibilityRole="button" accessibilityLabel={t('discover.positionAvailable')}>
          <LocateFixed size={isVeryCompact ? ms(17) : ms(20)} color={palette.violet} strokeWidth={2} />
        </TouchableOpacity>
      )}

      {selectedMerchant && (
        <MerchantCallout key={selectedMerchant.id} merchant={selectedMerchant} distance={selectedMerchantDistance}
          onPress={() => handleMerchantPress(selectedMerchant)} onNavigate={() => openInMaps(selectedMerchant)}
          style={{ top: calloutTop, bottom: undefined, left: isVeryCompact ? wp(12) : wp(16), right: isVeryCompact ? wp(12) : wp(16) }} />
      )}

      {isLoading && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
            <ActivityIndicator size="large" color={palette.violet} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.searching')}</Text>
          </View>
        </View>
      )}

      {isError && !isLoading && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <TouchableOpacity style={[styles.emptyCard, { backgroundColor: theme.bgCard }]} activeOpacity={0.7} onPress={() => refetch()} accessibilityRole="button">
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
            <Text style={[styles.emptyText, { color: palette.violet }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {mappableMerchants.length === 0 && !isLoading && !isError && mapReady && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {searchQuery ? t('discover.noResultsFor', { query: searchQuery }) : selectedCategory !== 'all' ? t('discover.noCategoryMerchant') : t('discover.noPositionMerchant')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const searchResultsStyles = StyleSheet.create({
  dropdown: {
    marginTop: ms(6), borderRadius: ms(16), borderWidth: 1, overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12 }, android: { elevation: 6 } }),
  },
  scroll: { maxHeight: ms(300) },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: ms(12), paddingHorizontal: ms(14), borderBottomWidth: StyleSheet.hairlineWidth, gap: ms(10) },
  logo: { width: ms(36), height: ms(36), borderRadius: ms(10) },
  logoFallback: { width: ms(36), height: ms(36), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: ms(16) },
  info: { flex: 1 },
  name: { fontSize: FS.md, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  sub: { fontSize: FS.xs, marginTop: ms(2), fontFamily: 'Lexend_400Regular' },
  emptyDropdown: { alignItems: 'center', justifyContent: 'center', paddingVertical: ms(20), gap: ms(8) },
  emptyText: { fontSize: FS.sm, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
});
