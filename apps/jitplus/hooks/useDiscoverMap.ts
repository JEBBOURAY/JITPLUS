import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Alert, AppState, Keyboard, Linking, Platform } from 'react-native';
import type MapView from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useLanguage } from '@/contexts/LanguageContext';
import { haptic, HapticStyle } from '@/utils/haptics';
import { getDistanceKm } from '@/utils/distance';
import { useMapClustering } from '@/utils/mapClustering';
import { MAPS_AVAILABLE } from '@/components/SafeMapView';
import { Merchant } from '@/types';
import {
  DEBOUNCE_MS, MAP_ANIMATE_DURATION_MS,
  USER_LOCATION_ZOOM_DELTA, USER_CENTER_ZOOM_DELTA,
} from '@/constants';
import { CATEGORIES } from '@/utils/categories';
import { pointKey, pointName } from '@/utils/merchantPoint';
import { DEFAULT_REGION } from '@/components/discover/mapConstants';

const LOCATION_PROMPT_SHOWN_KEY = 'location_prompt_shown';
/** A last known position younger than this is shown right away, before the GPS fix. */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

/** Initial framing: merchants within this distance of the user are shown. */
const INITIAL_NEARBY_RADIUS_KM = 5;
/** Initial framing: at most this many of the nearest ones, so a dense city stays readable. */
const INITIAL_NEARBY_MAX = 10;
/** Below this distance to the farthest nearby merchant, zoom to a fixed street-level view instead. */
const INITIAL_MIN_SPAN_KM = 0.6;
/** Share of the visible span a pan/zoom must exceed to update the region state. */
const REGION_CHANGE_RATIO = 0.1;
/** Clusters that only split past this zoom are merchants at the same address. */
const SAME_SPOT_EXPANSION_ZOOM = 19;
/** Picking a merchant from the list zooms in to at least this span. */
const LIST_FOCUS_MAX_DELTA = 0.01;
/** Results shown in the search dropdown; the full list opens in the sheet. */
const SEARCH_DROPDOWN_MAX = 6;

type LatLng = { latitude: number; longitude: number };
/** The list sheet: the visible area (recomputed as the map moves), or a fixed set of merchants. */
type ListSheet = { mode: 'area' } | { mode: 'spot' | 'search'; merchants: Merchant[] };

/** Lowercase, accents removed: "Café" and "cafe" match, so do "Pâtisserie" and "patisserie". */
function normalizeSearch(text: string): string {
  let out = text;
  try { out = text.normalize('NFD'); } catch { /* engine without Unicode normalization: match accents as typed */ }
  return out.replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}


/** Copies sorted nearest first; the distance is computed once per merchant, not per comparison. */
function sortByDistance(list: Merchant[], origin: LatLng): Merchant[] {
  return list
    .map((m) => ({ m, d: getDistanceKm(origin.latitude, origin.longitude, m.latitude!, m.longitude!) }))
    .sort((a, b) => a.d - b.d)
    .map(({ m }) => m);
}

function inRegion(m: Merchant, r: typeof DEFAULT_REGION): boolean {
  return Math.abs(m.latitude! - r.latitude) <= r.latitudeDelta / 2
    && Math.abs(m.longitude! - r.longitude) <= r.longitudeDelta / 2;
}

export function useDiscoverMap(merchants: Merchant[]) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const didInitialFitRef = useRef(false);
  // The selection is a point key, not a merchant object: the card always shows
  // the current data, and disappears when the point leaves the filtered list
  // (refetch after a block, category change, search).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentRegion, setCurrentRegion] = useState(DEFAULT_REGION);
  const currentRegionRef = useRef(DEFAULT_REGION);
  const mapRef = useRef<MapView | null>(null);
  const mountedRef = useRef(true);
  const initialLocationCheckRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchPosition = useCallback(async () => {
    // The cached fix comes back at once; a fresh GPS fix can take seconds.
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
      if (last && mountedRef.current) {
        setUserLocation((prev) => prev ?? { latitude: last.coords.latitude, longitude: last.coords.longitude });
      }
    } catch { /* no cached position: wait for the fresh one */ }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (mountedRef.current) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) { if (__DEV__) console.log('Could not get location:', e); }
  }, []);

  // Location turned on in the system settings: pick it up when the user comes back.
  const hasLocationRef = useRef(false);
  useEffect(() => { hasLocationRef.current = userLocation != null; }, [userLocation]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || hasLocationRef.current) return;
      Location.getForegroundPermissionsAsync()
        .then((perm) => (perm.status === 'granted' ? fetchPosition() : undefined))
        .catch(() => {});
    });
    return () => sub.remove();
  }, [fetchPosition]);

  // Asked by the user: with the phone's location switched off, the fix would
  // fail silently. Android offers its own "turn on" dialog; iOS can only explain.
  const locateFromUser = useCallback(async () => {
    if (!(await Location.hasServicesEnabledAsync())) {
      if (Platform.OS === 'android') {
        try { await Location.enableNetworkProviderAsync(); } catch { return; /* refused in the system dialog */ }
      } else {
        Alert.alert(t('discover.locationServicesOffTitle'), t('discover.locationServicesOffBody'));
        return;
      }
    }
    await fetchPosition();
  }, [t, fetchPosition]);

  // The OS dialog is only shown after our own explanation: a refusal there can
  // be permanent, while "Later" on ours keeps the option open.
  const askForLocation = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'granted') { await locateFromUser(); return; }
      if (!perm.canAskAgain) {
        Alert.alert(t('discover.locationPromptTitle'), t('discover.locationBlockedBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
        ]);
        return;
      }
      Alert.alert(t('discover.locationPromptTitle'), t('discover.locationPromptBody'), [
        { text: t('notifications.later'), style: 'cancel' },
        {
          text: t('discover.locationAllow'),
          onPress: () => {
            Location.requestForegroundPermissionsAsync()
              .then(({ status }) => (status === 'granted' ? locateFromUser() : undefined))
              .catch(() => {});
          },
        },
      ]);
    } catch (e) { if (__DEV__) console.log('Could not check location permission:', e); }
  }, [t, locateFromUser]);

  // Silent when already granted; the explanation pops up by itself only once.
  useEffect(() => {
    if (initialLocationCheckRef.current) return;
    initialLocationCheckRef.current = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === 'granted') { await fetchPosition(); return; }
        if (perm.status !== 'undetermined' || !perm.canAskAgain) return;
        if (await AsyncStorage.getItem(LOCATION_PROMPT_SHOWN_KEY)) return;
        await AsyncStorage.setItem(LOCATION_PROMPT_SHOWN_KEY, '1');
        if (mountedRef.current) await askForLocation();
      } catch (e) { if (__DEV__) console.log('Could not get location:', e); }
    })();
  }, [fetchPosition, askForLocation]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Searchable text of each point: names, city, address and the categories in
  // the user's language (the raw ids like "CAFE" never matched "café").
  const searchIndex = useMemo(() => {
    const index = new Map<Merchant, string>();
    for (const m of merchants) {
      const categories = [m.categorie, ...(m.secondaryCategories ?? [])].filter(Boolean) as string[];
      index.set(m, normalizeSearch([
        m.nomBoutique, m.storeName, m.ville, m.adresse,
        ...categories.map((c) => `${c} ${t(`categories.${c}`, { defaultValue: c })}`),
      ].filter(Boolean).join(' ')));
    }
    return index;
  }, [merchants, t]);

  const filteredMerchants = useMemo(() => {
    const words = normalizeSearch(debouncedSearch).split(/\s+/).filter(Boolean);
    return merchants.filter((m) => {
      const matchesCategory = selectedCategory === 'all'
        || m.categorie === selectedCategory
        || (m.secondaryCategories?.includes(selectedCategory) ?? false);
      if (!matchesCategory) return false;
      if (words.length === 0) return true;
      const text = searchIndex.get(m) ?? '';
      return words.every((w) => text.includes(w));
    });
  }, [merchants, debouncedSearch, selectedCategory, searchIndex]);

  const mappableMerchants = useMemo(() => filteredMerchants.filter((m) => m.latitude != null && m.longitude != null), [filteredMerchants]);
  const filteredByKey = useMemo(() => new Map(filteredMerchants.map((m) => [pointKey(m), m])), [filteredMerchants]);
  const selectedMerchant = selectedKey ? filteredByKey.get(selectedKey) ?? null : null;
  // Search matches nearest first, then the ones without a position: the
  // dropdown shows the closest, "see all" keeps the same order.
  const searchMatches = useMemo(() => {
    if (normalizeSearch(debouncedSearch).length < 2) return [];
    const located = userLocation ? sortByDistance(mappableMerchants, userLocation) : mappableMerchants;
    const unlocated = filteredMerchants.filter((m) => m.latitude == null || m.longitude == null);
    return [...located, ...unlocated];
  }, [debouncedSearch, filteredMerchants, mappableMerchants, userLocation]);
  const searchResults = useMemo(() => searchMatches.slice(0, SEARCH_DROPDOWN_MAX), [searchMatches]);

  /** Only the categories some merchant has (out of 30), plus "all" and the current pick. */
  const categories = useMemo(() => {
    const present = new Set<string>();
    for (const m of merchants) {
      if (m.categorie) present.add(m.categorie);
      for (const c of m.secondaryCategories ?? []) present.add(c);
    }
    return CATEGORIES.filter((c) => c.id === 'all' || c.id === selectedCategory || present.has(c.id));
  }, [merchants, selectedCategory]);
  /** Merchants, not map points: one with three stores counts once. */
  const mappableMerchantCount = useMemo(() => new Set(mappableMerchants.map((m) => m.id)).size, [mappableMerchants]);
  const { mapItems, getClusterLeaves } = useMapClustering(mappableMerchants, currentRegion);

  const [listSheet, setListSheet] = useState<ListSheet | null>(null);

  // The pill only needs a count: cheap enough for every region change. The
  // sorted list (one distance per merchant) is built only while it is open.
  const areaCount = useMemo(() => {
    if (!MAPS_AVAILABLE) return 0;
    let n = 0;
    for (const m of mappableMerchants) if (inRegion(m, currentRegion)) n++;
    return n;
  }, [mappableMerchants, currentRegion]);

  const listMerchants = useMemo(() => {
    if (!listSheet) return [];
    // Fixed lists follow the data too: blocked, deactivated or filtered-out points drop out.
    if (listSheet.mode !== 'area') {
      return listSheet.merchants.map((m) => filteredByKey.get(pointKey(m))).filter((m): m is Merchant => m != null);
    }
    return sortByDistance(mappableMerchants.filter((m) => inRegion(m, currentRegion)), userLocation ?? currentRegion);
  }, [listSheet, filteredByKey, mappableMerchants, currentRegion, userLocation]);

  /** Without a map: the whole list, nearest first. */
  const sortedMappableMerchants = useMemo(() => {
    if (MAPS_AVAILABLE) return [];
    return userLocation ? sortByDistance(mappableMerchants, userLocation) : mappableMerchants;
  }, [mappableMerchants, userLocation]);

  const selectedMerchantDistance = useMemo(() => {
    if (!userLocation || !selectedMerchant?.latitude || !selectedMerchant?.longitude) return null;
    return getDistanceKm(userLocation.latitude, userLocation.longitude, selectedMerchant.latitude, selectedMerchant.longitude);
  }, [userLocation, selectedMerchant]);

  const handleRegionChange = useCallback((region: typeof DEFAULT_REGION, details?: { isGesture?: boolean }) => {
    currentRegionRef.current = region;
    // The user moved the map: the initial framing must not pull them back later
    // (list still loading, location granted from the settings afterwards).
    if (details?.isGesture) didInitialFitRef.current = true;
    // Relative thresholds: a fixed 0.003° ignored most zooms at street level.
    setCurrentRegion((prev) => (
      Math.abs(prev.latitudeDelta - region.latitudeDelta) > prev.latitudeDelta * REGION_CHANGE_RATIO
      || Math.abs(prev.latitude - region.latitude) > prev.latitudeDelta * REGION_CHANGE_RATIO
      || Math.abs(prev.longitude - region.longitude) > prev.longitudeDelta * REGION_CHANGE_RATIO
        ? region : prev
    ));
  }, []);

  const handleCategoryPress = useCallback((id: string) => { setSelectedCategory(id); setSelectedKey(null); haptic(); }, []);

  const handleClusterPress = useCallback((latitude: number, longitude: number, expansionZoom: number, clusterId: number) => {
    haptic(HapticStyle.Medium);
    setSelectedKey(null);
    // Merchants a few meters apart (same mall, same building): zooming cannot
    // split them, so list them instead.
    if (expansionZoom > SAME_SPOT_EXPANSION_ZOOM) {
      const leaves = getClusterLeaves(clusterId);
      if (leaves.length > 0) {
        setListSheet({ mode: 'spot', merchants: [...leaves].sort((a, b) => pointName(a).localeCompare(pointName(b))) });
        return;
      }
    }
    if (mapRef.current) {
      try {
        // Supercluster gives the zoom at which the cluster splits: go just there.
        const nextDelta = 360 / Math.pow(2, expansionZoom);
        mapRef.current.animateToRegion({ latitude, longitude, latitudeDelta: nextDelta, longitudeDelta: nextDelta }, MAP_ANIMATE_DURATION_MS + 50);
      } catch { /* ignore */ }
    }
  }, [getClusterLeaves]);

  // Initial framing, once: the user and the merchants around them. Fitting
  // every merchant zoomed out to the whole country as soon as they were spread
  // over several cities, and undid the zoom on the user.
  const didCenterOnUserRef = useRef(false);
  useEffect(() => {
    if (!mapReady || !userLocation || !mapRef.current || didInitialFitRef.current) return;
    const nearby = mappableMerchants
      .map((m) => ({ m, d: getDistanceKm(userLocation.latitude, userLocation.longitude, m.latitude!, m.longitude!) }))
      .filter((x) => x.d <= INITIAL_NEARBY_RADIUS_KM)
      .sort((x, y) => x.d - y.d)
      .slice(0, INITIAL_NEARBY_MAX);
    try {
      if (nearby.length > 0) {
        didInitialFitRef.current = true;
        // A merchant next door would make the fit zoom in to building level.
        if (nearby[nearby.length - 1].d < INITIAL_MIN_SPAN_KM) {
          mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: USER_CENTER_ZOOM_DELTA, longitudeDelta: USER_CENTER_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS + 100);
          return;
        }
        mapRef.current.fitToCoordinates(
          [...nearby.map(({ m }) => ({ latitude: m.latitude!, longitude: m.longitude! })), userLocation],
          { edgePadding: { top: 140, bottom: 220, left: 50, right: 50 }, animated: true },
        );
        return;
      }
      // Nobody around yet (or the list is still loading): show the user's area.
      if (!didCenterOnUserRef.current) {
        didCenterOnUserRef.current = true;
        mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: USER_LOCATION_ZOOM_DELTA, longitudeDelta: USER_LOCATION_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS + 100);
      }
      // List loaded and still nobody nearby: keep the user's area, stop here.
      if (mappableMerchants.length > 0) didInitialFitRef.current = true;
    } catch { /* ignore */ }
  }, [mapReady, userLocation, mappableMerchants]);

  const centerOnUser = useCallback(() => {
    haptic();
    if (!userLocation) { askForLocation(); return; }
    if (!mapRef.current) return;
    mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: USER_CENTER_ZOOM_DELTA, longitudeDelta: USER_CENTER_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS);
  }, [userLocation, askForLocation]);

  // Closing the search always drops its text: a hidden query would keep the
  // pins filtered with nothing on screen telling why some are missing.
  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setDebouncedSearch('');
    Keyboard.dismiss();
  }, []);

  // A pin tap opens the preview card; the card itself leads to the merchant page.
  const selectMerchant = useCallback((merchant: Merchant) => {
    haptic();
    setSelectedKey(pointKey(merchant));
    setListSheet(null);
    closeSearch();
  }, [closeSearch]);

  // On some providers a marker tap also fires the map's onPress: it must not
  // close the card the marker just opened.
  const handleMapPress = useCallback((e?: { nativeEvent?: { action?: string } }) => {
    if (e?.nativeEvent?.action === 'marker-press') return;
    setSelectedKey(null);
    setListSheet(null);
    closeSearch();
  }, [closeSearch]);

  const openAreaList = useCallback(() => {
    haptic();
    setSelectedKey(null);
    closeSearch();
    setListSheet({ mode: 'area' });
  }, [closeSearch]);

  const closeList = useCallback(() => setListSheet(null), []);

  // "See all results": the matches move to the sheet (nearest first), the search closes.
  const openSearchResults = useCallback(() => {
    haptic();
    setSelectedKey(null);
    closeSearch();
    setListSheet({ mode: 'search', merchants: searchMatches });
  }, [searchMatches, closeSearch]);

  const resetFilters = useCallback(() => {
    haptic();
    setSelectedCategory('all');
    closeSearch();
  }, [closeSearch]);

  // A row of the list: center the map on that merchant and open its card.
  const selectFromList = useCallback((merchant: Merchant) => {
    haptic();
    setListSheet(null);
    closeSearch();
    setSelectedKey(pointKey(merchant));
    if (merchant.latitude == null || merchant.longitude == null || !mapRef.current) return;
    const delta = Math.min(currentRegionRef.current.latitudeDelta, LIST_FOCUS_MAX_DELTA);
    try {
      mapRef.current.animateToRegion({ latitude: merchant.latitude, longitude: merchant.longitude, latitudeDelta: delta, longitudeDelta: delta }, MAP_ANIMATE_DURATION_MS);
    } catch { /* ignore */ }
  }, [closeSearch]);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  const toggleSearch = useCallback(() => {
    haptic();
    if (showSearch) closeSearch();
    else {
      // The card sits where the results drop down: it would hide the first ones.
      setSelectedKey(null);
      setShowSearch(true); // the input has autoFocus
    }
  }, [showSearch, closeSearch]);

  const toggleFilters = useCallback(() => { haptic(); setShowFilters((v) => !v); }, []);

  return {
    // search & filters
    searchQuery, setSearchQuery, debouncedSearch, searchResults, searchResultCount: filteredMerchants.length, showSearch, toggleSearch, openSearchResults,
    selectedCategory, categories, showFilters, toggleFilters, handleCategoryPress, resetFilters,
    activeFilterCount: selectedCategory !== 'all' ? 1 : 0,
    // data
    mappableMerchants, mappableMerchantCount, sortedMappableMerchants, mapItems,
    // map
    mapRef, mapReady, userLocation, handleMapReady, handleRegionChange, handleMapPress, handleClusterPress, centerOnUser,
    // selection & list
    selectedMerchant, selectedMerchantDistance, selectMerchant,
    listSheet, listMerchants, areaCount, openAreaList, closeList, selectFromList,
  };
}
