import React, { useReducer, useRef, useMemo, useEffect, useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import {
  Store, Navigation, Check, ChevronDown,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import MapView, { Marker, SafeMapViewRef } from '@/components/SafeMapView';
import AddressAutocomplete, { AddressResult } from '@/components/AddressAutocomplete';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import { getCategoryLabel as getCategoryLabelFn, getCategoryOptions, CATEGORY_EMOJIS } from '@/constants/categories';
import { reverseGeocodeAsync } from '@/utils/geocodeCache';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { palette } from '@/contexts/ThemeContext';
import { MerchantCategory } from '@/types';
import { ms, wp, hp, fontSize, radius } from '@/utils/responsive';
const FIVE_KM_DELTA = 0.045;

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#FAFAF8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#78716C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FAFAF8' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#F5F5F0' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F0EFEB' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DDD6FE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#A78BFA' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#EDE9FE' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#DDD6FE' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#F5F5F0' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#8B7E74' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#78716C' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#57534E' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.stroke', stylers: [{ color: '#FAFAF8' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#D6D3D1' }] },
] as const satisfies readonly unknown[];

export interface StoreConfigData {
  nomCommerce: string;
  categorie: MerchantCategory | '';
  ville: string;
  quartier: string;
  adresse: string;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  theme: ThemeColors;
  t: (key: string, params?: Record<string, unknown>) => string;
  store: StoreConfigData;
  setStore: (patch: Partial<StoreConfigData>) => void;
}

function StepStoreConfigInner({ theme, t, store, setStore }: Props) {
  const { nomCommerce, categorie, ville, quartier, adresse, latitude, longitude } = store;

  const [addressSearch, setAddressSearch] = useState('');
  const [locating, setLocating] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const mapRef = useRef<SafeMapViewRef>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (latitude === null && longitude === null) {
          setStore({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          reverseGeocodeAndLabel(loc.coords.latitude, loc.coords.longitude);
        }
      } catch { /* silently ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaultCenter = useMemo(() => ({
    latitude: latitude ?? userLocation?.latitude ?? 33.5731,
    longitude: longitude ?? userLocation?.longitude ?? -7.5898,
  }), [latitude, longitude, userLocation]);

  const reverseGeocodeAndLabel = async (lat: number, lng: number) => {
    try {
      const results = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const g = results[0];
        const parts = [g.street, g.name, g.district, g.subregion].filter(Boolean);
        const updates: Partial<StoreConfigData> = {};
        if (parts.length > 0) updates.adresse = parts.join(', ');
        if (g.city) updates.ville = g.city;
        if (g.district) updates.quartier = g.district;
        setStore(updates);
        if (parts.length > 0) setAddressSearch(parts.join(', '));
      }
    } catch { /* silently ignore */ }
  };

  const handleUseMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setUserLocation({ latitude: lat, longitude: lng });
      setStore({ latitude: lat, longitude: lng });
      mapRef.current?.animateToRegion({
        latitude: lat, longitude: lng,
        latitudeDelta: FIVE_KM_DELTA, longitudeDelta: FIVE_KM_DELTA,
      });
      await reverseGeocodeAndLabel(lat, lng);
    } catch { /* ignore */ }
    finally { setLocating(false); }
  };

  const getCategoryLabel = (cat?: MerchantCategory | '') => {
    if (!cat) return t('stores.sameCategoryLabel');
    return getCategoryLabelFn(cat);
  };

  return (
    <>
      {/* ── Store name + Category row ── */}
      <View style={styles.topRow}>
        <View style={styles.topRowName}>
          <Text style={[styles.label, { color: theme.text }]}>{t('stores.nameLabel')} *</Text>
          <View style={[styles.inputWrapper, {
            backgroundColor: theme.bgInput,
            borderColor: nomCommerce.trim() ? palette.charbon : theme.border,
            borderWidth: nomCommerce.trim() ? 2 : 1.5,
          }]}>
            <Store size={ms(16)} color={nomCommerce.trim() ? palette.charbon : theme.textMuted} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={nomCommerce}
              onChangeText={(v) => setStore({ nomCommerce: v })}
              placeholder={t('registerExtra.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              maxLength={100}
              autoFocus
            />
            {nomCommerce.trim().length > 0 && <Check size={ms(14)} color={palette.charbon} strokeWidth={2.5} />}
          </View>
        </View>
      </View>

      {/* ── Category ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
        <TouchableOpacity
          style={[styles.inputWrapper, {
            backgroundColor: theme.bgInput,
            borderColor: categorie ? palette.charbon : theme.border,
            borderWidth: categorie ? 2 : 1.5,
          }]}
          onPress={() => setShowCategoryPicker(!showCategoryPicker)}
        >
          <MerchantCategoryIcon category={categorie || MerchantCategory.AUTRE} size={ms(20)} />
          <Text style={[styles.input, { color: categorie ? theme.text : theme.textMuted, flex: 1 }]}>
            {getCategoryLabel(categorie)}
          </Text>
          <ChevronDown size={ms(14)} color={theme.textMuted} />
        </TouchableOpacity>

        {showCategoryPicker && (
          <ScrollView style={[styles.categoryList, { backgroundColor: theme.bgCard, borderColor: theme.border }]} nestedScrollEnabled>
            {getCategoryOptions().map((opt) => {
              const emoji = CATEGORY_EMOJIS[opt.value] ?? '';
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.categoryOption,
                    { borderColor: theme.border },
                    categorie === opt.value && { backgroundColor: palette.charbon + '15', borderColor: palette.charbon },
                  ]}
                  onPress={() => { setStore({ categorie: opt.value as MerchantCategory }); setShowCategoryPicker(false); }}
                >
                  {emoji ? <Text style={{ fontSize: 18 }}>{emoji}</Text> : <MerchantCategoryIcon category={opt.value} size={20} />}
                  <Text style={[styles.categoryOptionText, { color: theme.text }]}>{opt.label}</Text>
                  {categorie === opt.value && <Check size={14} color={palette.charbon} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Address + locate ── */}
      <View style={styles.fieldGroup}>
        <View style={styles.addressHeader}>
          <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>{t('stores.searchAddress')}</Text>
          <TouchableOpacity
            style={[styles.locateBtn, { backgroundColor: palette.charbon }]}
            onPress={handleUseMyLocation}
            disabled={locating}
            activeOpacity={0.7}
          >
            {locating
              ? <ActivityIndicator size="small" color="#fff" />
              : <Navigation size={ms(14)} color="#fff" strokeWidth={2} />}
            <Text style={styles.locateBtnText}>{t('stores.locateMe')}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ zIndex: 100, elevation: 5 }}>
          <AddressAutocomplete
            value={addressSearch}
            onChangeText={(text) => { setAddressSearch(text); setStore({ adresse: text }); }}
            placeholder={t('stores.addressSearchPlaceholder')}
            ville={ville}
            userLocation={userLocation}
            notFoundMessage={t('stores.addressNotFoundManual')}
            onSelect={(result: AddressResult) => {
              setStore({
                latitude: result.latitude,
                longitude: result.longitude,
                adresse: result.address,
                ...(result.city ? { ville: result.city } : {}),
                ...(result.district ? { quartier: result.district } : {}),
              });
              setAddressSearch(result.address);
              mapRef.current?.animateToRegion({
                latitude: result.latitude, longitude: result.longitude,
                latitudeDelta: FIVE_KM_DELTA, longitudeDelta: FIVE_KM_DELTA,
              });
            }}
          />
        </View>
      </View>

      {/* ── Map ── */}
      <View style={[styles.mapWrapper, { borderColor: palette.charbon + '20' }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          customMapStyle={MAP_STYLE}
          initialRegion={{
            latitude: defaultCenter.latitude,
            longitude: defaultCenter.longitude,
            latitudeDelta: FIVE_KM_DELTA,
            longitudeDelta: FIVE_KM_DELTA,
          }}
          showsPointsOfInterest={false}
          showsBuildings={false}
          onPress={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
            const coords = e.nativeEvent.coordinate;
            setStore({ latitude: coords.latitude, longitude: coords.longitude });
            reverseGeocodeAndLabel(coords.latitude, coords.longitude);
          }}
        >
          <Marker
            draggable
            coordinate={{ latitude: defaultCenter.latitude, longitude: defaultCenter.longitude }}
            opacity={latitude !== null && longitude !== null ? 1 : 0}
            pinColor={palette.charbon}
            onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
              const c = e.nativeEvent.coordinate;
              setStore({ latitude: c.latitude, longitude: c.longitude });
              reverseGeocodeAndLabel(c.latitude, c.longitude);
            }}
          />
        </MapView>
        {/* GPS indicator overlay */}
        {latitude !== null && longitude !== null && (
          <View style={styles.gpsOverlay}>
            <Check size={ms(12)} color="#fff" strokeWidth={3} />
            <Text style={styles.gpsOverlayText} numberOfLines={1}>
              {adresse || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

export const StepStoreConfig = React.memo(StepStoreConfigInner);

const styles = StyleSheet.create({
  fieldGroup: { marginBottom: hp(10) },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: hp(4),
  },
  topRow: { marginBottom: hp(10) },
  topRowName: { flex: 1 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: wp(12), gap: wp(8),
    minHeight: ms(42),
  },
  input: {
    flex: 1, fontSize: fontSize.sm,
    paddingVertical: Platform.OS === 'ios' ? hp(10) : hp(7),
  },
  categoryList: {
    marginTop: hp(6), borderRadius: radius.md, borderWidth: 1,
    maxHeight: 220, overflow: 'hidden',
  },
  categoryOption: {
    flexDirection: 'row', alignItems: 'center', gap: wp(8),
    paddingHorizontal: wp(12), paddingVertical: hp(9),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryOptionText: { flex: 1, fontSize: fontSize.xs, fontWeight: '500' },
  addressHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: hp(4),
  },
  locateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: wp(4),
    paddingHorizontal: wp(10), paddingVertical: hp(5),
    borderRadius: radius.md,
  },
  locateBtnText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },
  mapWrapper: {
    height: 150, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1,
  },
  map: { ...StyleSheet.absoluteFillObject },
  gpsOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    backgroundColor: 'rgba(31,41,55,0.8)',
    paddingHorizontal: wp(10), paddingVertical: hp(5),
  },
  gpsOverlayText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '600', flex: 1 },
});
