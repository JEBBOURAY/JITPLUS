import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import * as Location from 'expo-location';
import { useLanguage } from '@/contexts/LanguageContext';
import { reverseGeocodeAsync } from '@/utils/geocodeCache';
import type { SafeMapViewRef } from '@/components/SafeMapView';

/** Casablanca: where the map opens before a position is chosen. */
const DEFAULT_CENTER = { latitude: 33.5731, longitude: -7.5898 };
const ZOOM_DELTA = 0.045;

interface StoreLocationValues {
  latitude: number | null;
  longitude: number | null;
  adresse: string;
  ville: string;
  quartier: string;
}

type MapPressEvent = { nativeEvent: { coordinate: { latitude: number; longitude: number } } };

/**
 * The store position picked on the map or from GPS, with the address found for
 * it (reverse geocoding). Only the latest position may write the address:
 * two quick taps can answer out of order.
 */
export function useStoreLocation() {
  const { t } = useLanguage();
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [adresse, setAdresse] = useState('');
  const [ville, setVille] = useState('');
  const [quartier, setQuartier] = useState('');
  const [locating, setLocating] = useState(false);

  const mapRef = useRef<SafeMapViewRef>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const labelPosition = useCallback(async (lat: number, lng: number) => {
    const requestId = ++requestIdRef.current;
    const isLatest = () => mountedRef.current && requestId === requestIdRef.current;
    try {
      const results = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (!isLatest()) return;
      const g = results[0];
      const parts = g ? [g.street, g.name, g.district, g.subregion].filter(Boolean) : [];
      // No address for the new spot: clear the previous one (the coordinates
      // are shown instead) rather than labelling the marker with another place.
      setAdresse(parts.join(', '));
      setVille(g?.city ?? '');
      setQuartier(g?.district ?? '');
    } catch {
      if (!isLatest()) return;
      setAdresse('');
      setVille('');
      setQuartier('');
    }
  }, []);

  const setFromMap = useCallback((event: MapPressEvent) => {
    const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
    setLatitude(lat);
    setLongitude(lng);
    void labelPosition(lat, lng);
  }, [labelPosition]);

  /** Prominent disclosure the stores require before the system permission prompt. */
  const confirmDisclosure = useCallback(() => new Promise<boolean>((resolve) => {
    Alert.alert(
      t('stores.locationDisclosureTitle'),
      t('stores.locationDisclosureBody'),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('stores.locationDisclosureAllow'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  }), [t]);

  /**
   * true when the position may be read. The disclosure only shows when the
   * system prompt is about to appear: not once access is granted, and not when
   * the OS will no longer ask (the merchant must go to the settings then).
   */
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!current.canAskAgain) {
      Alert.alert(t('stores.permissionDenied'), t('stores.enableLocation'));
      return false;
    }
    if (!(await confirmDisclosure())) return false;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('stores.permissionDenied'), t('stores.enableLocation'));
      return false;
    }
    return true;
  }, [confirmDisclosure, t]);

  const locateMe = useCallback(async () => {
    Keyboard.dismiss();
    try {
      if (!(await ensurePermission())) return;
    } catch {
      Alert.alert(t('common.error'), t('stores.locationError'));
      return;
    }

    setLocating(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setLatitude(lat);
      setLongitude(lng);
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: ZOOM_DELTA, longitudeDelta: ZOOM_DELTA });
      await labelPosition(lat, lng);
    } catch {
      Alert.alert(t('common.error'), t('stores.locationError'));
    } finally {
      if (mountedRef.current) setLocating(false);
    }
  }, [ensurePermission, labelPosition, t]);

  /** Puts back a saved position (draft) without asking the geocoder again. */
  const restore = useCallback((saved: Partial<StoreLocationValues>) => {
    if (saved.latitude != null && saved.longitude != null) {
      setLatitude(saved.latitude);
      setLongitude(saved.longitude);
    }
    if (saved.adresse) setAdresse(saved.adresse);
    if (saved.ville) setVille(saved.ville);
    if (saved.quartier) setQuartier(saved.quartier);
  }, []);

  const marker = useMemo(
    () => (latitude != null && longitude != null ? { latitude, longitude } : null),
    [latitude, longitude],
  );

  const region = useMemo(() => ({
    latitude: latitude ?? DEFAULT_CENTER.latitude,
    longitude: longitude ?? DEFAULT_CENTER.longitude,
    latitudeDelta: ZOOM_DELTA,
    longitudeDelta: ZOOM_DELTA,
  }), [latitude, longitude]);

  /** Shown under the map: the address, or the coordinates when none was found. */
  const label = marker ? adresse || `${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}` : '';

  const values = useMemo<StoreLocationValues>(
    () => ({ latitude, longitude, adresse, ville, quartier }),
    [latitude, longitude, adresse, ville, quartier],
  );

  return {
    values,
    marker,
    region,
    label,
    locating,
    mapRef,
    setFromMap,
    locateMe,
    restore,
  };
}

export type StoreLocationState = ReturnType<typeof useStoreLocation>;
