import { useState, useCallback, useRef, useEffect, useMemo, memo, type ComponentProps } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, FlatList, Pressable,
  Platform, TouchableOpacity, Linking, Keyboard, I18nManager,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Search, MapPin, X,
  LocateFixed, SlidersHorizontal,
} from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import * as Location from 'expo-location';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Merchant } from '@/types';
import FadeInView from '@/components/FadeInView';
import SafeMapView, { Marker, MAPS_AVAILABLE } from '@/components/SafeMapView';
import { CATEGORIES } from '@/utils/categories';
import { getDistanceKm } from '@/utils/distance';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useMerchants } from '@/hooks/useQueryHooks';
import { prefetchImages } from '@/utils/imageCache';
import MapMarker from '@/components/MapMarker';
import ClusterMarker from '@/components/ClusterMarker';
import { useMapClustering } from '@/utils/mapClustering';
import {
  DEBOUNCE_MS, FOCUS_DELAY_MS, MAP_ANIMATE_DURATION_MS,
  MERCHANT_FOCUS_ZOOM_DELTA, USER_LOCATION_ZOOM_DELTA, USER_CENTER_ZOOM_DELTA,
  CLUSTER_ZOOM_DIVISOR, COMPACT_SCREEN_HEIGHT,
} from '@/constants';
import { FallbackMerchantCard, MerchantCallout } from '@/components/discover';
import { discoverStyles as styles } from '@/components/discover/discoverStyles';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

// Full Morocco view — covers all provinces including Western Sahara (21°N to 36°N).
const DEFAULT_REGION = {
  latitude: 28.5,
  longitude: -9.5,
  latitudeDelta: 17.0,
  longitudeDelta: 18.0,
};

/**
 * Premium map style — warm ivory tones with violet-tinted water.
 * Minimalist, uncluttered; roads remain for orientation.
 */
const MAP_STYLE = [
  // Base — warm ivory
  { elementType: 'geometry', stylers: [{ color: '#FAFAF8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#78716C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FAFAF8' }] },
  // Landscape — subtle warm texture
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#F5F5F0' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F0EFEB' }] },
  // Water — soft violet-tinted blue (premium signature)
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DDD6FE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#A78BFA' }] },
  // Roads — clean whites with soft warm strokes
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#EDE9FE' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#DDD6FE' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#F5F5F0' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#8B7E74' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#78716C' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  // Hide clutter
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  // Admin labels — elegant warm grey
  { featureType: 'administrative', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#57534E' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.stroke', stylers: [{ color: '#FAFAF8' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#D6D3D1' }] },
] as const;

/**
 * Wrapper around <Marker> that starts with tracksViewChanges=true so
 * Android Google Maps captures the custom-view bitmap, then switches
 * to false after a short delay for performance.
 * On iOS the snapshot is reliable so we always pass false.
 */
const TRACK_DELAY_MS = 500;
const IS_ANDROID = Platform.OS === 'android';

const TrackedMarker = memo(function TrackedMarker(
  props: ComponentProps<typeof Marker>,
) {
  const [tracked, setTracked] = useState(IS_ANDROID);
  useEffect(() => {
    if (!IS_ANDROID) return;
    const t = setTimeout(() => setTracked(false), TRACK_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return <Marker {...props} tracksViewChanges={tracked} />;
});

export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { client, isGuest } = useAuth();
  const { t } = useLanguage();
  const isVeryCompact = screenHeight < COMPACT_SCREEN_HEIGHT;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const didInitialFitRef = useRef(false);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentRegion, setCurrentRegion] = useState(DEFAULT_REGION);
  const currentRegionRef = useRef(DEFAULT_REGION);

  const searchInputRef = useRef<TextInput>(null);
  const mapRef = useRef<any>(null);

  // ── React Query: load ALL merchants (enabled for guests too) ──
  const { data: merchants = [], isLoading, isError, refetch } = useMerchants(!!client || isGuest);

  // Prefetch merchant logos once loaded
  useEffect(() => {
    if (merchants.length > 0) {
      prefetchImages(merchants.map((m) => m.logoUrl).filter(Boolean));
    }
  }, [merchants]);



  // Handle focusMerchantId from Cartes tab navigation
  const { focusMerchantId } = useLocalSearchParams<{ focusMerchantId?: string }>();
  // Track the last focused ID to avoid re-animating on React Query merchants refresh
  const lastFocusedMerchantIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (focusMerchantId && merchants.length > 0 && focusMerchantId !== lastFocusedMerchantIdRef.current) {
      lastFocusedMerchantIdRef.current = focusMerchantId;
      const target = merchants.find((m) => m.id === focusMerchantId);
      if (target) {
        setSelectedMerchant(target);
        if (target.latitude != null && target.longitude != null && mapRef.current) {
          try {
            mapRef.current.animateToRegion({
              latitude: target.latitude,
              longitude: target.longitude,
              latitudeDelta: MERCHANT_FOCUS_ZOOM_DELTA,
              longitudeDelta: MERCHANT_FOCUS_ZOOM_DELTA,
            }, MAP_ANIMATE_DURATION_MS);
          } catch (e) { if (__DEV__) console.warn('animateToRegion failed', e); }
        }
      }
    }
  }, [focusMerchantId, merchants]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          if (mounted) {
            setUserLocation(coords);
          }
        }
      } catch (e) {
        if (__DEV__) console.log('Could not get location:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Debounce search to avoid re-filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredMerchants = useMemo(() => merchants.filter((m) => {
    const matchesSearch =
      m.nomBoutique?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      m.storeName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      m.categorie?.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || m.categorie === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [merchants, debouncedSearch, selectedCategory]);

  // Backend already filters by radius — we only keep merchants with valid coordinates.
  const mappableMerchants = useMemo(
    () => filteredMerchants.filter((m) => m.latitude != null && m.longitude != null),
    [filteredMerchants],
  );

  // Cluster markers based on current zoom level
  const mapItems = useMapClustering(mappableMerchants, currentRegion);

  const sortedMappableMerchants = useMemo(() => {
    if (MAPS_AVAILABLE) return [];  // Only used in fallback list
    return userLocation
      ? [...mappableMerchants].sort((a, b) =>
          getDistanceKm(userLocation.latitude, userLocation.longitude, a.latitude!, a.longitude!) -
          getDistanceKm(userLocation.latitude, userLocation.longitude, b.latitude!, b.longitude!))
      : mappableMerchants;
  }, [mappableMerchants, userLocation]);

  /** Memoized distance for the selected callout merchant */
  const selectedMerchantDistance = useMemo(() => {
    if (!userLocation || !selectedMerchant?.latitude || !selectedMerchant?.longitude) return null;
    return getDistanceKm(userLocation.latitude, userLocation.longitude, selectedMerchant.latitude, selectedMerchant.longitude);
  }, [userLocation, selectedMerchant]);

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

  const handleCategoryPress = useCallback((id: string) => {
    setSelectedCategory(id);
    setSelectedMerchant(null);
    haptic();
  }, []);

  const handleMerchantPress = useCallback((merchant: Merchant) => {
    haptic(HapticStyle.Medium);
    router.push({ pathname: '/merchant/[id]', params: { id: merchant.id } });
  }, [router]);

  const handleMarkerPress = useCallback((merchant: Merchant) => {
    setSelectedMerchant(merchant);
    haptic();
  }, []);

  const handleClusterPress = useCallback((latitude: number, longitude: number, expansionZoom?: number) => {
    haptic(HapticStyle.Medium);
    setSelectedMerchant(null);
    if (mapRef.current) {
      try {
        const region = currentRegionRef.current;
        const nextRegion = {
          latitude,
          longitude,
          latitudeDelta: expansionZoom 
            ? 360 / Math.pow(2, expansionZoom) // Calculate delta from zoom
            : region.latitudeDelta / CLUSTER_ZOOM_DIVISOR,
          longitudeDelta: expansionZoom
            ? 360 / Math.pow(2, expansionZoom)
            : region.longitudeDelta / CLUSTER_ZOOM_DIVISOR,
        };

        mapRef.current.animateToRegion(nextRegion, MAP_ANIMATE_DURATION_MS + 50);
      } catch (e) { if (__DEV__) console.warn('animateToRegion failed', e); }
    }
  }, []);

  const handleRegionChange = useCallback((_region: typeof DEFAULT_REGION) => {
    currentRegionRef.current = _region;
    // Only trigger re-render + reclustering for significant viewport changes
    const prev = currentRegion;
    const zoomDelta = Math.abs(prev.latitudeDelta - _region.latitudeDelta);
    const latDelta = Math.abs(prev.latitude - _region.latitude);
    const lngDelta = Math.abs(prev.longitude - _region.longitude);
    if (zoomDelta > 0.003 || latDelta > 0.003 || lngDelta > 0.003) {
      setCurrentRegion(_region);
    }
  }, [currentRegion]);

  // Animate to user position as soon as both map and location are ready
  useEffect(() => {
    if (!mapReady || !userLocation || !mapRef.current) return;
    try {
      mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: USER_LOCATION_ZOOM_DELTA, longitudeDelta: USER_LOCATION_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS + 100);
    } catch (e) { if (__DEV__) console.warn('animateToRegion failed', e); }
  }, [mapReady, userLocation]);

  // Fit all nearby merchants once — fires when map + location + merchants are all ready
  useEffect(() => {
    if (!mapReady || !userLocation || mappableMerchants.length === 0 || !mapRef.current || didInitialFitRef.current) return;
    didInitialFitRef.current = true;
    try {
      mapRef.current.fitToCoordinates(
        [...mappableMerchants.map((m) => ({ latitude: m.latitude!, longitude: m.longitude! })), userLocation],
        { edgePadding: { top: ms(120), bottom: ms(200), left: ms(40), right: ms(40) }, animated: true },
      );
    } catch (e) { if (__DEV__) console.warn('fitToCoordinates failed', e); }
  }, [mapReady, userLocation, mappableMerchants]);

  const centerOnUser = useCallback(() => {
    if (!userLocation || !mapRef.current) return;
    haptic();
    mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: USER_CENTER_ZOOM_DELTA, longitudeDelta: USER_CENTER_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS);
  }, [userLocation]);

  const toggleSearch = useCallback(() => {
    haptic();
    setShowSearch((v) => {
      if (!v) setTimeout(() => searchInputRef.current?.focus(), FOCUS_DELAY_MS);
      else { setSearchQuery(''); Keyboard.dismiss(); }
      return !v;
    });
  }, []);

  const toggleFilters = useCallback(() => {
    haptic();
    setShowFilters((v) => !v);
  }, []);

  const activeFilterCount = selectedCategory !== 'all' ? 1 : 0;
  const topBarTop = insets.top + (isVeryCompact ? ms(6) : ms(10));
  const filterTop = insets.top + (isVeryCompact ? ms(54) : ms(64));
  const calloutTop = insets.top + (isVeryCompact ? ms(54) : ms(60)) + (showFilters ? (isVeryCompact ? ms(48) : ms(54)) : 0);
  const locateBottom = isVeryCompact ? ms(84) : ms(100);
  const fallbackTopPadding = insets.top + (isVeryCompact ? ms(94) : ms(110));
  const fallbackBottomPadding = isVeryCompact ? ms(116) : ms(140);

  const handleMapPress = useCallback(() => {
    setSelectedMerchant(null);
    setShowSearch(false);
    Keyboard.dismiss();
  }, []);

  const handleMapReady = useCallback(() => setMapReady(true), []);

  const fallbackKeyExtractor = useCallback(
    (m: Merchant) => m.storeId ? `${m.id}-${m.storeId}` : m.id,
    [],
  );

  const renderFallbackItem = useCallback(({ item: m }: { item: Merchant }) => {
    const dist = userLocation
      ? getDistanceKm(userLocation.latitude, userLocation.longitude, m.latitude!, m.longitude!)
      : null;
    return (
      <FallbackMerchantCard
        merchant={m}
        distance={dist}
        onPress={() => handleMerchantPress(m)}
        onNavigate={() => openInMaps(m)}
      />
    );
  }, [userLocation, handleMerchantPress, openInMaps]);

  return (
    <View style={styles.container}>
      {/* Map */}
      {MAPS_AVAILABLE ? (
        <SafeMapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={DEFAULT_REGION}
          showsUserLocation showsMyLocationButton={false} showsCompass={false}
          showsPointsOfInterest={false}
          showsBuildings={false}
          showsIndoors={false}
          showsTraffic={false}
          customMapStyle={MAP_STYLE as any}
          onMapReady={handleMapReady}
          onRegionChangeComplete={handleRegionChange}
          onPress={handleMapPress}
        >
          {mapItems.map((item) => {
            if (item.type === 'cluster') {
              return (
                <TrackedMarker
                  key={item.id}
                  coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                  onPress={() => handleClusterPress(item.latitude, item.longitude, item.expansionZoom)}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <ClusterMarker count={item.count} />
                </TrackedMarker>
              );
            }
            const m = item.merchant;
            return (
              <TrackedMarker
                key={m.storeId ? `${m.id}-${m.storeId}` : m.id}
                coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                onPress={() => handleMarkerPress(m)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <MapMarker />
              </TrackedMarker>
            );
          })}
        </SafeMapView>
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.bg }]}>
          <FlatList
            data={sortedMappableMerchants}
            keyExtractor={fallbackKeyExtractor}
            renderItem={renderFallbackItem}
            contentContainerStyle={[styles.fallbackList, { paddingTop: fallbackTopPadding, paddingBottom: fallbackBottomPadding }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            removeClippedSubviews={Platform.OS !== 'web'}
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={8}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyState}>
                  <MapPin size={ms(40)} color={theme.textMuted} strokeWidth={2} />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    {searchQuery ? t('discover.noResultsFor', { query: searchQuery }) : t('discover.noGeoMerchant')}
                  </Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* Floating UI */}
      <View style={[styles.topBar, { top: topBarTop, paddingHorizontal: isVeryCompact ? wp(12) : wp(16) }]} pointerEvents="box-none">
        {showSearch ? (
          <View style={[styles.searchBarExpanded, { backgroundColor: theme.bgCard, height: isVeryCompact ? ms(46) : ms(52), paddingHorizontal: isVeryCompact ? wp(14) : wp(18) }]}>
            <Search size={isVeryCompact ? ms(16) : ms(18)} color={theme.textMuted} strokeWidth={2} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: theme.text, fontSize: isVeryCompact ? FS.sm : FS.md }]}
              placeholder={t('discover.searchPlaceholder')}
              placeholderTextColor={theme.inputPlaceholder}
              value={searchQuery} onChangeText={setSearchQuery}
              returnKeyType="search" autoFocus
            />
            <Pressable onPress={toggleSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('discover.searchPlaceholder')}>
              <View style={[styles.closePill, { backgroundColor: theme.bgInput, width: isVeryCompact ? ms(26) : ms(30), height: isVeryCompact ? ms(26) : ms(30), borderRadius: isVeryCompact ? ms(13) : ms(15) }]}>
                <X size={isVeryCompact ? ms(12) : ms(14)} color={theme.textMuted} strokeWidth={2} />
              </View>
            </Pressable>
          </View>
        ) : (
          <View style={styles.topButtons}>
            <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: theme.bgCard, width: isVeryCompact ? ms(42) : ms(48), height: isVeryCompact ? ms(42) : ms(48), borderRadius: isVeryCompact ? ms(21) : ms(24) }]} activeOpacity={0.8} onPress={toggleSearch} accessibilityRole="button" accessibilityLabel={t('discover.searchPlaceholder')}>
              <Search size={isVeryCompact ? ms(18) : ms(20)} color={theme.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.counterBadge, { backgroundColor: theme.bgCard, paddingHorizontal: isVeryCompact ? wp(12) : wp(16), paddingVertical: isVeryCompact ? hp(7) : hp(10) }]}>
              <MapPin size={isVeryCompact ? ms(12) : ms(13)} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.counterText, { color: theme.text, fontSize: isVeryCompact ? FS.xs : FS.sm }]}>
                {t('discover.merchantCount', { count: mappableMerchants.length })}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.floatingBtn, { backgroundColor: theme.bgCard, width: isVeryCompact ? ms(42) : ms(48), height: isVeryCompact ? ms(42) : ms(48), borderRadius: isVeryCompact ? ms(21) : ms(24) }, showFilters && { backgroundColor: palette.violet }]}
              activeOpacity={0.8} onPress={toggleFilters}
              accessibilityRole="button"
              accessibilityState={{ expanded: showFilters }}
            >
              <SlidersHorizontal size={isVeryCompact ? ms(18) : ms(20)} color={showFilters ? '#fff' : theme.text} strokeWidth={2} />
              {activeFilterCount > 0 && <View style={styles.filterDot} />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Filter chips */}
      {showFilters && (
        <View style={[styles.filterBar, { top: filterTop }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { paddingHorizontal: isVeryCompact ? wp(12) : wp(16), paddingVertical: isVeryCompact ? hp(2) : hp(4), gap: isVeryCompact ? wp(4) : wp(6) }, I18nManager.isRTL && { flexDirection: 'row-reverse' }]}>
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const Icon = cat.icon;
              return (
                <Pressable key={cat.id} onPress={() => handleCategoryPress(cat.id)} accessibilityRole="button" accessibilityState={{ selected: isActive }}>
                  <View style={[
                    styles.chip,
                    {
                      paddingHorizontal: isVeryCompact ? wp(10) : wp(14),
                      paddingVertical: isVeryCompact ? hp(6) : hp(8),
                      borderRadius: isVeryCompact ? ms(16) : ms(20),
                    },
                    isActive
                      ? { backgroundColor: palette.violet, borderColor: palette.violet }
                      : { backgroundColor: theme.bgCard, borderColor: theme.border },
                  ]}>
                    <Icon size={isVeryCompact ? ms(11) : ms(13)} color={isActive ? '#fff' : theme.textMuted} strokeWidth={2} />
                    <Text style={[styles.chipLabel, { color: isActive ? '#fff' : theme.text, fontSize: isVeryCompact ? ms(10.5) : FS.xs }]}>
                      {t(cat.labelKey)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Locate button */}
      {MAPS_AVAILABLE && userLocation && (
        <TouchableOpacity
          style={[styles.locateBtn, { backgroundColor: theme.bgCard, bottom: locateBottom, right: isVeryCompact ? wp(12) : wp(16), width: isVeryCompact ? ms(42) : ms(48), height: isVeryCompact ? ms(42) : ms(48), borderRadius: isVeryCompact ? ms(21) : ms(24) }]}
          activeOpacity={0.8} onPress={centerOnUser}
          accessibilityRole="button"
          accessibilityLabel={t('discover.positionAvailable')}
        >
          <LocateFixed size={isVeryCompact ? ms(17) : ms(20)} color={palette.violet} strokeWidth={2} />
        </TouchableOpacity>
      )}

      {/* Callout card — just below the filter/search bar */}
      {selectedMerchant && (
        <MerchantCallout
          key={selectedMerchant.id}
          merchant={selectedMerchant}
          distance={selectedMerchantDistance}
          onPress={() => handleMerchantPress(selectedMerchant)}
          onNavigate={() => openInMaps(selectedMerchant)}
          style={{
            top: calloutTop,
            bottom: undefined,
            left: isVeryCompact ? wp(12) : wp(16),
            right: isVeryCompact ? wp(12) : wp(16),
          }}
        />
      )}

      {/* Loading overlay */}
      {isLoading && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
            <ActivityIndicator size="large" color={palette.violet} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.searching')}</Text>
          </View>
        </View>
      )}

      {/* Error overlay with retry */}
      {isError && !isLoading && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}
            activeOpacity={0.7}
            onPress={() => refetch()}
            accessibilityRole="button"
          >
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
            <Text style={[styles.emptyText, { color: palette.violet }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty overlay — guarded by mapReady to avoid flash on initial load */}
      {mappableMerchants.length === 0 && !isLoading && !isError && mapReady && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {searchQuery
                ? t('discover.noResultsFor', { query: searchQuery })
                : selectedCategory !== 'all'
                  ? t('discover.noCategoryMerchant')
                  : t('discover.noPositionMerchant')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
