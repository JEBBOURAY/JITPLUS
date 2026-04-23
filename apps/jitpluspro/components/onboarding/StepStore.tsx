import React, { useReducer, useRef, useMemo, useEffect, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Store, Navigation, Check, ChevronDown,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import MapView, { Marker, SafeMapViewRef } from '@/components/SafeMapView';
import AddressAutocomplete, { AddressResult } from '@/components/AddressAutocomplete';
import MerchantCategoryIcon, { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import { getCategoryLabel as getCategoryLabelFn, getCategoryOptions } from '@/constants/categories';
import { geocodeAsync, reverseGeocodeAsync } from '@/utils/geocodeCache';
import { palette } from '@/contexts/ThemeContext';
import { MerchantCategory } from '@/types';
import type { ThemeProp } from './shared';
import { ms, wp } from '@/utils/responsive';
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

// ── Form state ──
interface FormState {
  nom: string;
  categorie: MerchantCategory | '';
  ville: string;
  quartier: string;
  adresse: string;
  latitude: number | null;
  longitude: number | null;
  addressSearch: string;
  locating: boolean;
  showCategoryPicker: boolean;
}

const INITIAL_FORM: FormState = {
  nom: '',
  categorie: '',
  ville: '',
  quartier: '',
  adresse: '',
  latitude: null,
  longitude: null,
  addressSearch: '',
  locating: false,
  showCategoryPicker: false,
};

type FormAction =
  | { type: 'SET'; payload: Partial<FormState> }
  | { type: 'RESET' };

function formReducer(s: FormState, a: FormAction): FormState {
  switch (a.type) {
    case 'SET': return { ...s, ...a.payload };
    case 'RESET': return INITIAL_FORM;
  }
}

interface Props {
  theme: ThemeProp;
  t: (key: string, params?: Record<string, any>) => string;
  bottomPadding: number;
  merchantCategorie?: MerchantCategory;
  merchantVille?: string;
  saving: boolean;
  storeCreated: boolean;
  onCreateStore: (payload: {
    nom: string;
    categorie?: string;
    ville?: string;
    quartier?: string;
    adresse?: string;
    latitude?: number;
    longitude?: number;
  }) => void;
}

export function StepStore({
  theme, t, bottomPadding,
  merchantCategorie, merchantVille,
  saving, storeCreated, onCreateStore,
}: Props) {
  const [form, dispatch] = useReducer(formReducer, {
    ...INITIAL_FORM,
    categorie: merchantCategorie ?? '',
    ville: merchantVille ?? '',
  });
  const { nom, categorie, ville, quartier, adresse, latitude, longitude, addressSearch, locating, showCategoryPicker } = form;
  const setForm = useCallback((p: Partial<FormState>) => dispatch({ type: 'SET', payload: p }), []);

  const mapRef = useRef<SafeMapViewRef>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Fetch user GPS once
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (latitude === null && longitude === null) {
          setForm({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
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
        const updates: Partial<FormState> = { addressSearch: parts.join(', ') };
        if (parts.length > 0) updates.adresse = parts.join(', ');
        if (g.city) updates.ville = g.city;
        if (g.district) updates.quartier = g.district;
        setForm(updates);
      }
    } catch { /* silently ignore */ }
  };

  const handleUseMyLocation = async () => {
    setForm({ locating: true });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setUserLocation({ latitude: lat, longitude: lng });
      setForm({ latitude: lat, longitude: lng });
      mapRef.current?.animateToRegion({
        latitude: lat, longitude: lng,
        latitudeDelta: FIVE_KM_DELTA, longitudeDelta: FIVE_KM_DELTA,
      });
      await reverseGeocodeAndLabel(lat, lng);
    } catch { /* ignore */ }
    finally { setForm({ locating: false }); }
  };

  const getCategoryLabel = (cat?: MerchantCategory | '') => {
    if (!cat) return t('stores.sameCategoryLabel');
    return getCategoryLabelFn(cat);
  };

  const handleSave = () => {
    if (!nom.trim()) {
      Alert.alert(t('common.error'), t('onboarding.storeNameRequired'));
      return;
    }
    onCreateStore({
      nom: nom.trim(),
      categorie: categorie || undefined,
      ville: ville.trim() || undefined,
      quartier: quartier.trim() || undefined,
      adresse: adresse.trim() || undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
    });
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.stepScroll, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header icon */}
      <View style={styles.iconWrap}>
        <LinearGradient
          colors={[palette.violet, palette.violetLight]}
          style={styles.iconBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Store color={palette.white} size={44} strokeWidth={1.5} />
        </LinearGradient>
      </View>

      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t('onboarding.storeTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
        {t('onboarding.storeSubtitle')}
      </Text>

      {/* ── Store name ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('stores.nameLabel')} *</Text>
        <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: nom.trim() ? palette.violet : theme.border }]}>
          <Store size={ms(18)} color={nom.trim() ? palette.violet : theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={nom}
            onChangeText={(v) => setForm({ nom: v })}
            placeholder={t('stores.namePlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={100}
          />
          {nom.trim().length > 0 && <Check size={ms(16)} color={palette.violet} strokeWidth={2.5} />}
        </View>
      </View>

      {/* ── Category ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
        <TouchableOpacity
          style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: categorie ? palette.violet : theme.border }]}
          onPress={() => setForm({ showCategoryPicker: !showCategoryPicker })}
        >
          <MerchantCategoryIcon category={categorie || merchantCategorie || MerchantCategory.AUTRE} size={ms(22)} />
          <Text style={[styles.input, { color: categorie ? theme.text : theme.textMuted, flex: 1 }]}>
            {getCategoryLabel(categorie)}
          </Text>
          <ChevronDown size={ms(16)} color={theme.textMuted} />
        </TouchableOpacity>

        {showCategoryPicker && (
          <View style={[styles.categoryList, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            {getCategoryOptions().map((opt) => {
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.categoryOption,
                    { borderColor: theme.border },
                    categorie === opt.value && { backgroundColor: palette.violet + '15', borderColor: palette.violet },
                  ]}
                  onPress={() => setForm({ categorie: opt.value as MerchantCategory, showCategoryPicker: false })}
                >
                  <MerchantCategoryIcon category={opt.value} size={22} />
                  <Text style={[styles.categoryOptionText, { color: theme.text }]}>{opt.label}</Text>
                  {categorie === opt.value && <Check size={16} color={palette.violet} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── GPS locate ── */}
      <TouchableOpacity
        style={[styles.locateCard, { backgroundColor: palette.violet + '08', borderColor: palette.violet + '20' }]}
        onPress={handleUseMyLocation}
        disabled={locating}
        activeOpacity={0.7}
      >
        <View style={[styles.locateIcon, { backgroundColor: palette.violet }]}>
          {locating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Navigation size={ms(18)} color="#fff" strokeWidth={1.5} />}
        </View>
        <View style={{ flex: 1, marginLeft: wp(12) }}>
          <Text style={[styles.locateTitle, { color: theme.text }]}>{t('stores.locateMe')}</Text>
          <Text style={[styles.locateHint, { color: theme.textMuted }]}>{t('stores.locateMeHint')}</Text>
        </View>
      </TouchableOpacity>

      {/* ── City / District ── */}
      <View style={styles.rowFields}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text }]}>{t('stores.cityLabel')}</Text>
          <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: ville.trim() ? palette.violet : theme.border }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={ville}
              onChangeText={(v) => setForm({ ville: v })}
              onEndEditing={async () => {
                const city = ville.trim();
                if (city.length < 2) return;
                try {
                  const results = await geocodeAsync(`${city}, ${t('common.morocco')}`);
                  if (results.length > 0) {
                    const { latitude: lat, longitude: lng } = results[0];
                    setForm({ latitude: lat, longitude: lng });
                    mapRef.current?.animateToRegion({
                      latitude: lat, longitude: lng,
                      latitudeDelta: FIVE_KM_DELTA, longitudeDelta: FIVE_KM_DELTA,
                    });
                  }
                } catch { /* ignore */ }
              }}
              placeholder={t('stores.cityPlaceholder')}
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text }]}>{t('stores.districtLabel')}</Text>
          <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: quartier.trim() ? palette.violet : theme.border }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={quartier}
              onChangeText={(v) => setForm({ quartier: v })}
              placeholder={t('stores.districtPlaceholder')}
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>
      </View>

      {/* ── Address autocomplete ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('stores.searchAddress')}</Text>
        <View style={{ zIndex: 100, elevation: 5 }}>
          <AddressAutocomplete
            value={addressSearch}
            onChangeText={(text) => setForm({ addressSearch: text, adresse: text })}
            placeholder={t('stores.addressSearchPlaceholder')}
            ville={ville}
            userLocation={userLocation}
            notFoundMessage={t('stores.addressNotFoundManual')}
            onSelect={(result: AddressResult) => {
              setForm({
                latitude: result.latitude,
                longitude: result.longitude,
                adresse: result.address,
                addressSearch: result.address,
                ...(result.city ? { ville: result.city } : {}),
                ...(result.district ? { quartier: result.district } : {}),
              });
              mapRef.current?.animateToRegion({
                latitude: result.latitude, longitude: result.longitude,
                latitudeDelta: FIVE_KM_DELTA, longitudeDelta: FIVE_KM_DELTA,
              });
            }}
          />
        </View>
      </View>

      {/* ── Map ── */}
      <View style={[styles.mapWrapper, { borderColor: palette.violet + '20' }]}>
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
            setForm({ latitude: coords.latitude, longitude: coords.longitude });
            reverseGeocodeAndLabel(coords.latitude, coords.longitude);
          }}
        >
          <Marker
            draggable
            coordinate={{ latitude: defaultCenter.latitude, longitude: defaultCenter.longitude }}
            opacity={latitude !== null && longitude !== null ? 1 : 0}
            pinColor={palette.violet}
            onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
              const c = e.nativeEvent.coordinate;
              setForm({ latitude: c.latitude, longitude: c.longitude });
              reverseGeocodeAndLabel(c.latitude, c.longitude);
            }}
          />
        </MapView>
      </View>

      <Text style={[styles.mapHint, { color: theme.textMuted }]}>{t('stores.mapHint')}</Text>

      {latitude !== null && longitude !== null && (
        <View style={[styles.gpsIndicator, { backgroundColor: `${palette.violet}12` }]}>
          <Check size={ms(14)} color={palette.violet} strokeWidth={2.5} />
          <Text style={[styles.gpsIndicatorText, { color: palette.violet }]}>
            {adresse || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
          </Text>
        </View>
      )}

      {/* ── Create button ── */}
      {storeCreated ? (
        <View style={[styles.successBadge, { backgroundColor: palette.violet + '14' }]}>
          <Check size={ms(20)} color={palette.violet} strokeWidth={2.5} />
          <Text style={[styles.successText, { color: palette.violet }]}>{t('onboarding.storeCreated')}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: saving ? palette.violet + '80' : palette.violet }]}
          onPress={handleSave}
          disabled={saving || !nom.trim()}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Check size={ms(18)} color="#fff" strokeWidth={2} />
              <Text style={styles.createBtnText}>{t('onboarding.storeCreateBtn')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <Text style={[styles.skipHint, { color: theme.textMuted }]}>
        {t('onboarding.storeSkipHint')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stepScroll: { paddingHorizontal: 24, paddingTop: 28 },
  iconWrap: { alignItems: 'center', marginBottom: 20 },
  iconBg: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: {
    fontSize: 24, fontFamily: 'Lexend_700Bold',
    textAlign: 'center', marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14, fontFamily: 'Lexend_400Regular',
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 13, fontFamily: 'Lexend_500Medium',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, gap: 10,
    minHeight: ms(48),
  },
  input: {
    flex: 1, fontSize: 15, fontFamily: 'Lexend_400Regular',
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  categoryList: {
    marginTop: 8, borderRadius: 12, borderWidth: 1,
    maxHeight: 260, overflow: 'hidden',
  },
  categoryOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryOptionText: { flex: 1, fontSize: 14, fontFamily: 'Lexend_400Regular' },
  locateCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16,
  },
  locateIcon: {
    width: ms(38), height: ms(38), borderRadius: ms(10),
    alignItems: 'center', justifyContent: 'center',
  },
  locateTitle: { fontSize: 14, fontFamily: 'Lexend_600SemiBold' },
  locateHint: { fontSize: 12, fontFamily: 'Lexend_400Regular', marginTop: 2 },
  rowFields: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mapWrapper: {
    height: 200, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, marginBottom: 8, marginTop: 8,
  },
  map: { ...StyleSheet.absoluteFillObject },
  mapHint: {
    fontSize: 12, fontFamily: 'Lexend_400Regular',
    textAlign: 'center', marginBottom: 12,
  },
  gpsIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 16,
  },
  gpsIndicatorText: { fontSize: 12, fontFamily: 'Lexend_500Medium', flex: 1 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 12,
  },
  createBtnText: {
    color: '#fff', fontSize: 15, fontFamily: 'Lexend_600SemiBold',
  },
  successBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 12,
  },
  successText: { fontSize: 15, fontFamily: 'Lexend_600SemiBold' },
  skipHint: {
    fontSize: 12, fontFamily: 'Lexend_400Regular',
    textAlign: 'center', marginTop: 4,
  },
});
