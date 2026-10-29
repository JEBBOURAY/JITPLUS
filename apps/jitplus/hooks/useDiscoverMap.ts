import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Alert, Keyboard, Linking, type TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { haptic, HapticStyle } from '@/utils/haptics';
import { getDistanceKm } from '@/utils/distance';
import { useMapClustering } from '@/utils/mapClustering';
import { MAPS_AVAILABLE } from '@/components/SafeMapView';
import { Merchant } from '@/types';
import {
  DEBOUNCE_MS, MAP_ANIMATE_DURATION_MS, MERCHANT_FOCUS_ZOOM_DELTA,
  USER_LOCATION_ZOOM_DELTA, USER_CENTER_ZOOM_DELTA, CLUSTER_ZOOM_DIVISOR,
} from '@/constants';
import { DEFAULT_REGION } from '@/components/discover/mapConstants';

const LOCATION_PROMPT_SHOWN_KEY = 'location_prompt_shown';

export function useDiscoverMap(merchants: Merchant[]) {
  const { t } = useLanguage();
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
  const mapRef = useRef<any>(null);
  const searchInputRef = useRef<TextInput>(null);
  const lastFocusedMerchantIdRef = useRef<string | undefined>(undefined);
  const mountedRef = useRef(true);
  const initialLocationCheckRef = useRef(false);

  const { focusMerchantId } = useLocalSearchParams<{ focusMerchantId?: string }>();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchPosition = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000 });
      if (mountedRef.current) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) { if (__DEV__) console.log('Could not get location:', e); }
  }, []);

  // The OS dialog is only shown after our own explanation: a refusal there can
  // be permanent, while "Later" on ours keeps the option open.
  const askForLocation = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'granted') { await fetchPosition(); return; }
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
              .then(({ status }) => (status === 'granted' ? fetchPosition() : undefined))
              .catch(() => {});
          },
        },
      ]);
    } catch (e) { if (__DEV__) console.log('Could not check location permission:', e); }
  }, [t, fetchPosition]);

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

  // Focus merchant from navigation params
  useEffect(() => {
    if (focusMerchantId && merchants.length > 0 && focusMerchantId !== lastFocusedMerchantIdRef.current) {
      lastFocusedMerchantIdRef.current = focusMerchantId;
      const target = merchants.find((m) => m.id === focusMerchantId);
      if (target) {
        setSelectedMerchant(target);
        if (target.latitude != null && target.longitude != null && mapRef.current) {
          try { mapRef.current.animateToRegion({ latitude: target.latitude, longitude: target.longitude, latitudeDelta: MERCHANT_FOCUS_ZOOM_DELTA, longitudeDelta: MERCHANT_FOCUS_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS); } catch { /* ignore */ }
        }
      }
    }
  }, [focusMerchantId, merchants]);

  const filteredMerchants = useMemo(() => merchants.filter((m) => {
    const matchesSearch = m.nomBoutique?.toLowerCase().includes(debouncedSearch.toLowerCase()) || m.storeName?.toLowerCase().includes(debouncedSearch.toLowerCase()) || m.categorie?.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || m.categorie === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [merchants, debouncedSearch, selectedCategory]);

  const mappableMerchants = useMemo(() => filteredMerchants.filter((m) => m.latitude != null && m.longitude != null), [filteredMerchants]);
  const mapItems = useMapClustering(mappableMerchants, currentRegion);

  const sortedMappableMerchants = useMemo(() => {
    if (MAPS_AVAILABLE) return [];
    return userLocation
      ? [...mappableMerchants].sort((a, b) => getDistanceKm(userLocation.latitude, userLocation.longitude, a.latitude!, a.longitude!) - getDistanceKm(userLocation.latitude, userLocation.longitude, b.latitude!, b.longitude!))
      : mappableMerchants;
  }, [mappableMerchants, userLocation]);

  const selectedMerchantDistance = useMemo(() => {
    if (!userLocation || !selectedMerchant?.latitude || !selectedMerchant?.longitude) return null;
    return getDistanceKm(userLocation.latitude, userLocation.longitude, selectedMerchant.latitude, selectedMerchant.longitude);
  }, [userLocation, selectedMerchant]);

  const handleRegionChange = useCallback((region: typeof DEFAULT_REGION) => {
    currentRegionRef.current = region;
    setCurrentRegion((prev) => (
      Math.abs(prev.latitudeDelta - region.latitudeDelta) > 0.003
      || Math.abs(prev.latitude - region.latitude) > 0.003
      || Math.abs(prev.longitude - region.longitude) > 0.003
        ? region : prev
    ));
  }, []);

  const handleCategoryPress = useCallback((id: string) => { setSelectedCategory(id); setSelectedMerchant(null); haptic(); }, []);

  const handleClusterPress = useCallback((latitude: number, longitude: number, expansionZoom?: number) => {
    haptic(HapticStyle.Medium);
    setSelectedMerchant(null);
    if (mapRef.current) {
      try {
        const region = currentRegionRef.current;
        const nextDelta = expansionZoom ? 360 / Math.pow(2, expansionZoom) : region.latitudeDelta / CLUSTER_ZOOM_DIVISOR;
        mapRef.current.animateToRegion({ latitude, longitude, latitudeDelta: nextDelta, longitudeDelta: nextDelta }, MAP_ANIMATE_DURATION_MS + 50);
      } catch { /* ignore */ }
    }
  }, []);

  // Animate to user on map ready
  useEffect(() => {
    if (!mapReady || !userLocation || !mapRef.current) return;
    try { mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: USER_LOCATION_ZOOM_DELTA, longitudeDelta: USER_LOCATION_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS + 100); } catch { /* ignore */ }
  }, [mapReady, userLocation]);

  // Fit all merchants once
  useEffect(() => {
    if (!mapReady || !userLocation || mappableMerchants.length === 0 || !mapRef.current || didInitialFitRef.current) return;
    didInitialFitRef.current = true;
    try {
      mapRef.current.fitToCoordinates(
        [...mappableMerchants.map((m) => ({ latitude: m.latitude!, longitude: m.longitude! })), userLocation],
        { edgePadding: { top: 120, bottom: 200, left: 40, right: 40 }, animated: true },
      );
    } catch { /* ignore */ }
  }, [mapReady, userLocation, mappableMerchants]);

  const centerOnUser = useCallback(() => {
    haptic();
    if (!userLocation) { askForLocation(); return; }
    if (!mapRef.current) return;
    mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: USER_CENTER_ZOOM_DELTA, longitudeDelta: USER_CENTER_ZOOM_DELTA }, MAP_ANIMATE_DURATION_MS);
  }, [userLocation, askForLocation]);

  const handleMapPress = useCallback(() => { setSelectedMerchant(null); setShowSearch(false); Keyboard.dismiss(); }, []);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  return {
    searchQuery, setSearchQuery, debouncedSearch, selectedCategory, showSearch, setShowSearch, showFilters,
    userLocation, mapReady, selectedMerchant, mapRef, searchInputRef,
    filteredMerchants, mappableMerchants, mapItems, sortedMappableMerchants, selectedMerchantDistance,
    handleRegionChange, handleCategoryPress, handleClusterPress,
    centerOnUser, handleMapPress, handleMapReady,
    toggleSearch: useCallback(() => {
      haptic();
      setShowSearch((v) => {
        if (!v) setTimeout(() => searchInputRef.current?.focus(), 100);
        else { setSearchQuery(''); Keyboard.dismiss(); }
        return !v;
      });
    }, []),
    toggleFilters: useCallback(() => { haptic(); setShowFilters((v) => !v); }, []),
    activeFilterCount: selectedCategory !== 'all' ? 1 : 0,
  };
}
