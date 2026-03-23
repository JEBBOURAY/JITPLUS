import { useState, useCallback, useRef, useEffect, useMemo, memo, type ComponentProps } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, FlatList, Pressable,
  Platform, TouchableOpacity, Linking, Keyboard, Image as RNImage, I18nManager,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Search, MapPin, ChevronRight, X,
  Navigation, ExternalLink, LocateFixed, SlidersHorizontal,
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
import { getDistanceKm, formatDistance } from '@/utils/distance';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useMerchants } from '@/hooks/useQueryHooks';
import { resolveImageUrl } from '@/utils/imageUrl';
import { prefetchImages } from '@/utils/imageCache';
import MerchantLogo from '@/components/MerchantLogo';
import MapMarker from '@/components/MapMarker';
import ClusterMarker from '@/components/ClusterMarker';
import { useMapClustering } from '@/utils/mapClustering';

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

const TrackedMarker = memo(function TrackedMarker(
  props: ComponentProps<typeof Marker>,
) {
  const [tracked, setTracked] = useState(Platform.OS === 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const t = setTimeout(() => setTracked(false), TRACK_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return <Marker {...props} tracksViewChanges={tracked} />;
});

// ── Extracted memoized sub-components ────────────────────

const FallbackMerchantCard = memo(function FallbackMerchantCard({
  merchant,
  distance,
  onPress,
  onNavigate,
}: {
  merchant: Merchant;
  distance: number | null;
  onPress: () => void;
  onNavigate: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <Pressable
      style={[styles.fallbackCard, { backgroundColor: theme.bgCard }]}
      onPress={onPress}
    >
      <View style={[styles.fallbackAvatar, { backgroundColor: palette.violet + '15' }]}>
        <MerchantLogo logoUrl={merchant.logoUrl} style={styles.fallbackLogo} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fallbackName, { color: theme.text }]} numberOfLines={1}>{merchant.nomBoutique}</Text>
        {merchant.categorie && (
          <View style={[styles.catBadge, { backgroundColor: palette.violet + '15' }]}>
            <Text style={[styles.catBadgeText, { color: palette.violet }]}>{merchant.categorie}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(4), marginTop: hp(2) }}>
          <MapPin size={ms(11)} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={[styles.fallbackAddr, { color: theme.textMuted }]} numberOfLines={1}>
            {merchant.adresse || merchant.ville || t('discover.positionAvailable')}
          </Text>
        </View>
        {distance !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(3), marginTop: hp(3) }}>
            <Navigation size={ms(10)} color={palette.violet} strokeWidth={1.5} />
            <Text style={{ fontSize: FS.xs, fontWeight: '700', color: palette.violet }}>
              {formatDistance(distance)}
            </Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[styles.fallbackNavBtn, { backgroundColor: palette.violet }]}
        activeOpacity={0.7} onPress={onNavigate}
      >
        <ExternalLink size={ms(14)} color="#fff" strokeWidth={1.5} />
      </TouchableOpacity>
    </Pressable>
  );
});

const MerchantCallout = memo(function MerchantCallout({
  merchant,
  distance,
  onPress,
  onNavigate,
  style,
}: {
  merchant: Merchant;
  distance: number | null;
  onPress: () => void;
  onNavigate: () => void;
  style?: import('react-native').ViewStyle;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [logoError, setLogoError] = useState(false);
  return (
    <View style={[styles.calloutWrapper, style]}>
      <Pressable style={[styles.calloutCard, { backgroundColor: theme.bgCard }]} onPress={onPress}>
        {/* Premium left accent bar */}
        <View style={styles.calloutAccent} />
        <View style={[styles.calloutAvatar, { backgroundColor: palette.violet + '10' }]}>
          {merchant.logoUrl && !logoError ? (
            <Image
              source={resolveImageUrl(merchant.logoUrl)}
              style={styles.merchantLogo}
              contentFit="cover"
              cachePolicy="disk"
              onError={() => setLogoError(true)}
            />
          ) : (
            <RNImage source={require('@/assets/images/jitpluslogo.png')} style={styles.merchantLogo} resizeMode="contain" />
          )}
        </View>
        <View style={styles.calloutInfo}>
          <Text style={[styles.calloutName, { color: theme.text }]} numberOfLines={1}>{merchant.nomBoutique}</Text>
          {merchant.categorie && (
            <View style={[styles.catBadge, { backgroundColor: palette.violet + '12', marginTop: hp(3) }]}>
              <Text style={[styles.catBadgeText, { color: palette.violet }]}>{merchant.categorie}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(4), marginTop: hp(5) }}>
            <MapPin size={ms(11)} color={theme.textMuted} strokeWidth={1.5} />
            <Text style={{ fontSize: FS.xs, color: theme.textMuted }} numberOfLines={1}>
              {merchant.adresse || merchant.ville || ''}
            </Text>
          </View>
          {distance != null && (
            <View style={styles.calloutDistRow}>
              <Navigation size={ms(10)} color={palette.violet} strokeWidth={1.5} />
              <Text style={styles.calloutDist}>
                {formatDistance(distance)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.calloutActions}>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: palette.violet }]}
            activeOpacity={0.7} onPress={onNavigate}
            accessibilityRole="button"
            accessibilityLabel={t('discover.positionAvailable')}
          >
            <Navigation size={ms(16)} color="#fff" strokeWidth={1.5} />
          </TouchableOpacity>
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} />
        </View>
      </Pressable>
    </View>
  );
});

export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { client, isGuest } = useAuth();
  const { t } = useLanguage();
  const isVeryCompact = screenHeight < 710;

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
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }, 600);
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
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredMerchants = useMemo(() => merchants.filter((m) => {
    const matchesSearch =
      m.nomBoutique?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
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
    const label = encodeURIComponent(m.nomBoutique);
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
        const nextRegion = {
          latitude,
          longitude,
          latitudeDelta: expansionZoom 
            ? 360 / Math.pow(2, expansionZoom) // Calculate delta from zoom
            : currentRegion.latitudeDelta / 2.5,
          longitudeDelta: expansionZoom
            ? 360 / Math.pow(2, expansionZoom)
            : currentRegion.longitudeDelta / 2.5,
        };

        mapRef.current.animateToRegion(nextRegion, 650);
      } catch (e) { if (__DEV__) console.warn('animateToRegion failed', e); }
    }
  }, [currentRegion]);

  const handleRegionChange = useCallback((_region: typeof DEFAULT_REGION) => {
    setCurrentRegion(_region);
  }, []);

  // Animate to user position as soon as both map and location are ready
  useEffect(() => {
    if (!mapReady || !userLocation || !mapRef.current) return;
    try {
      mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 700);
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
    mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 600);
  }, [userLocation]);

  const toggleSearch = useCallback(() => {
    haptic();
    setShowSearch((v) => {
      if (!v) setTimeout(() => searchInputRef.current?.focus(), 100);
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
                <MapMarker
                  userPoints={m.userPoints}
                  categorie={m.categorie}
                />
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
                  <MapPin size={ms(40)} color={theme.textMuted} strokeWidth={1.5} />
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
            <Search size={isVeryCompact ? ms(16) : ms(18)} color={theme.textMuted} strokeWidth={1.5} />
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
                <X size={isVeryCompact ? ms(12) : ms(14)} color={theme.textMuted} strokeWidth={1.5} />
              </View>
            </Pressable>
          </View>
        ) : (
          <View style={styles.topButtons}>
            <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: theme.bgCard, width: isVeryCompact ? ms(42) : ms(48), height: isVeryCompact ? ms(42) : ms(48), borderRadius: isVeryCompact ? ms(21) : ms(24) }]} activeOpacity={0.8} onPress={toggleSearch} accessibilityRole="button" accessibilityLabel={t('discover.searchPlaceholder')}>
              <Search size={isVeryCompact ? ms(18) : ms(20)} color={theme.text} strokeWidth={1.5} />
            </TouchableOpacity>
            <View style={[styles.counterBadge, { backgroundColor: theme.bgCard, paddingHorizontal: isVeryCompact ? wp(12) : wp(16), paddingVertical: isVeryCompact ? hp(7) : hp(10) }]}>
              <MapPin size={isVeryCompact ? ms(12) : ms(13)} color={palette.violet} strokeWidth={1.5} />
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
              <SlidersHorizontal size={isVeryCompact ? ms(18) : ms(20)} color={showFilters ? '#fff' : theme.text} strokeWidth={1.5} />
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
                    <Icon size={isVeryCompact ? ms(11) : ms(13)} color={isActive ? '#fff' : theme.textMuted} strokeWidth={1.5} />
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
          <LocateFixed size={isVeryCompact ? ms(17) : ms(20)} color={palette.violet} strokeWidth={1.5} />
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
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('discover.noMerchantFound')}</Text>
            <Text style={[styles.emptyText, { color: palette.violet }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty overlay — guarded by mapReady to avoid flash on initial load */}
      {mappableMerchants.length === 0 && !isLoading && !isError && mapReady && MAPS_AVAILABLE && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
            <MapPin size={ms(32)} color={theme.textMuted} strokeWidth={1.5} />
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

// ── Premium shadow tokens ──
const SHADOW_PREMIUM = {
  shadowColor: palette.violet, shadowOpacity: 0.10,
  shadowOffset: { width: 0, height: hp(3) }, shadowRadius: 16, elevation: 4,
};
const SHADOW = {
  shadowColor: '#000', shadowOpacity: 0.06,
  shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 12, elevation: 3,
};
const SHADOW_LIGHT = {
  shadowColor: '#000', shadowOpacity: 0.04,
  shadowOffset: { width: 0, height: hp(1) }, shadowRadius: 8, elevation: 2,
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Top bar
  topBar: { position: 'absolute', left: 0, right: 0, paddingHorizontal: wp(16), zIndex: 10 },
  topButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floatingBtn: {
    width: ms(48), height: ms(48), borderRadius: ms(24),
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM,
  },
  counterBadge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    backgroundColor: '#fff', paddingHorizontal: wp(16), paddingVertical: hp(10),
    borderRadius: ms(24), borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM,
  },
  counterText: { fontSize: FS.sm, fontWeight: '700', color: '#1e293b' },
  filterDot: {
    position: 'absolute', top: ms(8), right: ms(8),
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: palette.violet, borderWidth: 1.5, borderColor: '#fff',
  },

  // Search
  searchBarExpanded: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: ms(28), paddingHorizontal: wp(18), height: ms(52), gap: wp(10),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.08)', ...SHADOW_PREMIUM,
  },
  searchInput: { flex: 1, fontSize: FS.md, color: '#1e293b', paddingVertical: 0 },
  closePill: {
    width: ms(30), height: ms(30), borderRadius: ms(15),
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },

  // Filters
  filterBar: { position: 'absolute', left: 0, right: 0, zIndex: 9 },
  filterScroll: { paddingHorizontal: wp(16), paddingVertical: hp(4), gap: wp(6) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5),
    paddingHorizontal: wp(14), paddingVertical: hp(8),
    borderRadius: ms(20), borderWidth: 1, marginRight: wp(2), ...SHADOW_LIGHT,
  },
  chipLabel: { fontSize: FS.xs, fontWeight: '600' },

  // Merchant logos (callout + fallback)
  merchantLogo: { width: ms(38), height: ms(38), borderRadius: ms(10) },
  fallbackLogo: { width: ms(34), height: ms(34), borderRadius: ms(10) },

  // Locate
  locateBtn: {
    position: 'absolute', right: wp(16),
    width: ms(48), height: ms(48), borderRadius: ms(24),
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM, zIndex: 10,
  },

  // Callout
  calloutWrapper: {
    position: 'absolute', left: wp(16), right: wp(16), zIndex: 10,
  },
  calloutCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: ms(22), padding: wp(14),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.08)',
    overflow: 'hidden', ...SHADOW_PREMIUM,
  },
  calloutAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: ms(4), borderTopLeftRadius: ms(22), borderBottomLeftRadius: ms(22),
    backgroundColor: palette.violet,
  },
  calloutAvatar: {
    width: ms(56), height: ms(56), borderRadius: ms(16),
    alignItems: 'center', justifyContent: 'center', marginRight: wp(12), overflow: 'hidden',
  },
  calloutInfo: { flex: 1 },
  calloutName: { fontSize: FS.lg, fontWeight: '700', color: '#1e293b', letterSpacing: -0.3 },
  calloutActions: { alignItems: 'center', gap: hp(8), marginLeft: wp(8) },
  calloutDistRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(3), marginTop: hp(4),
    backgroundColor: 'rgba(124,58,237,0.06)', alignSelf: 'flex-start',
    paddingHorizontal: wp(8), paddingVertical: hp(2), borderRadius: ms(8),
  },
  calloutDist: {
    fontSize: FS.xs, fontWeight: '700', color: palette.violet, letterSpacing: 0.2,
  },
  navBtn: {
    width: ms(42), height: ms(42), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center',
  },
  catBadge: { alignSelf: 'flex-start', paddingHorizontal: wp(8), paddingVertical: hp(2), borderRadius: radius.sm },
  catBadgeText: { fontSize: ms(11), fontWeight: '600' },

  // Empty
  emptyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  emptyCard: {
    alignItems: 'center', backgroundColor: '#fff',
    padding: wp(28), borderRadius: radius['2xl'], marginHorizontal: wp(40),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM,
  },
  emptyState: { alignItems: 'center', paddingTop: hp(60) },
  emptyTitle: { fontSize: FS.lg, fontWeight: '700', color: '#334155', marginTop: hp(12) },
  emptyText: { fontSize: FS.sm, color: '#94a3b8', textAlign: 'center', marginTop: hp(6), lineHeight: ms(20) },

  // Fallback
  fallbackList: { paddingHorizontal: wp(16) },
  fallbackCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: ms(18), padding: wp(14), marginBottom: hp(10),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_LIGHT,
  },
  fallbackAvatar: {
    width: ms(50), height: ms(50), borderRadius: ms(16),
    alignItems: 'center', justifyContent: 'center', marginRight: wp(12), overflow: 'hidden',
  },
  fallbackName: { fontSize: FS.md, fontWeight: '700', color: '#1e293b', marginBottom: hp(2) },
  fallbackAddr: { fontSize: FS.xs, color: '#94a3b8' },
  fallbackNavBtn: {
    width: ms(40), height: ms(40), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center', marginLeft: wp(8),
  },
});
