import React, { useState, useRef, useMemo, useEffect, useReducer, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Store,
  Plus,
  Lock,
  ArrowLeft,
  Trash2,
  Edit3,
  MapPin,
  Phone,
  Mail,
  X,
  Check,
  Search,
  ToggleLeft,
  ToggleRight,
  Navigation,
  Tag,
  Contact,
  ChevronDown,
} from 'lucide-react-native';
import MapView, { Marker, PROVIDER_GOOGLE, SafeMapViewRef } from '@/components/SafeMapView';
import AddressAutocomplete, { AddressResult } from '@/components/AddressAutocomplete';
import * as Location from 'expo-location';
import { geocodeAsync, reverseGeocodeAsync } from '@/utils/geocodeCache';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Store as StoreType, MerchantCategory, CreateStorePayload } from '@/types';
import MerchantCategoryIcon, { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import { getCategoryLabel as getCategoryLabelFn, getCategoryOptions, CATEGORY_EMOJIS } from '@/constants/categories';
import { useStoresCRUD, MAX_STORES } from '@/hooks/useStoresCRUD';
import { isValidEmail } from '@/utils/validation';
import PremiumLockModal from '@/components/PremiumLockModal';

const googleMapsApiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey ?? '';

/** Extracted as a proper React.memo component — theme consumed internally */
const StoreCard = React.memo(function StoreCard({ store, merchantCategorie, onEdit, onToggle, onDelete }: {
  store: StoreType;
  merchantCategorie?: MerchantCategory;
  onEdit: (s: StoreType) => void;
  onToggle: (s: StoreType) => void;
  onDelete: (s: StoreType) => void;
}) {
  const theme = useTheme();
  const cat = store.categorie ?? merchantCategorie ?? MerchantCategory.AUTRE;
  const { label: catLabel } = useCategoryMetadata(cat);
  const { t } = useLanguage();

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <MerchantCategoryIcon category={cat} size={32} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={[styles.cardName, { color: theme.text }]}>{store.nom}</Text>
            <Text style={[styles.cardSub, { color: theme.textMuted }]}>{catLabel}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: store.isActive ? theme.primaryBg : `${theme.danger}14` }]}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: store.isActive ? theme.primary : theme.danger }}>
              {store.isActive ? t('stores.active') : t('stores.inactive')}
            </Text>
          </View>
        </View>
      </View>

      {store.adresse ? (
        <View style={styles.cardDetail}>
          <MapPin size={14} color={theme.textMuted} />
          <Text style={[styles.cardDetailText, { color: theme.textMuted }]} numberOfLines={1}>
            {[store.adresse, store.quartier, store.ville].filter(Boolean).join(', ')}
          </Text>
        </View>
      ) : null}

      {store.telephone ? (
        <View style={styles.cardDetail}>
          <Phone size={14} color={theme.textMuted} />
          <Text style={[styles.cardDetailText, { color: theme.textMuted }]}>{store.telephone}</Text>
        </View>
      ) : null}

      {store.email ? (
        <View style={styles.cardDetail}>
          <Mail size={14} color={theme.textMuted} />
          <Text style={[styles.cardDetailText, { color: theme.textMuted }]}>{store.email}</Text>
        </View>
      ) : null}

      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.bgInput }]} onPress={() => onEdit(store)}>
          <Edit3 size={16} color={theme.primary} />
          <Text style={[styles.actionBtnText, { color: theme.primary }]}>{t('stores.editBtn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.bgInput }]} onPress={() => onToggle(store)}>
          {store.isActive
            ? <ToggleRight size={16} color={theme.primary} />
            : <ToggleLeft size={16} color={theme.textMuted} />}
          <Text style={[styles.actionBtnText, { color: store.isActive ? theme.primary : theme.textMuted }]}>
            {store.isActive ? t('stores.active') : t('stores.inactive')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fef2f2' }]} onPress={() => onDelete(store)}>
          <Trash2 size={16} color="#dc2626" />
          <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>{t('stores.deleteBtn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── Form reducer ──
interface FormState {
  nom: string;
  categorie: MerchantCategory | '';
  ville: string;
  quartier: string;
  adresse: string;
  telephone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  addressSearch: string;
  isGeoSearching: boolean;
  locating: boolean;
  showCategoryPicker: boolean;
}

const INITIAL_FORM: FormState = {
  nom: '',
  categorie: '',
  ville: '',
  quartier: '',
  adresse: '',
  telephone: '',
  email: '',
  latitude: null,
  longitude: null,
  addressSearch: '',
  isGeoSearching: false,
  locating: false,
  showCategoryPicker: false,
};

type FormAction =
  | { type: 'SET'; payload: Partial<FormState> }
  | { type: 'RESET'; defaults?: Partial<FormState> }
  | { type: 'LOAD_STORE'; store: StoreType };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'RESET':
      return { ...INITIAL_FORM, ...action.defaults };
    case 'LOAD_STORE': {
      const s = action.store;
      return {
        ...state,
        nom: s.nom,
        categorie: s.categorie ?? '',
        ville: s.ville ?? '',
        quartier: s.quartier ?? '',
        adresse: s.adresse ?? '',
        telephone: s.telephone ?? '',
        email: s.email ?? '',
        latitude: s.latitude ?? null,
        longitude: s.longitude ?? null,
        addressSearch: s.adresse ?? '',
        showCategoryPicker: false,
      };
    }
  }
}

export default function StoresScreen() {
  const theme = useTheme();
  const { merchant } = useAuth();
  const isPremium = merchant?.plan === 'PREMIUM';
  const FREE_MAX_STORES = 1;
  const effectiveMax = isPremium ? MAX_STORES : FREE_MAX_STORES;

  const [premiumModal, setPremiumModal] = useState<{ visible: boolean; titleKey: string; descKey: string }>(
    { visible: false, titleKey: '', descKey: '' },
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    stores, loading, refreshing, saving, onRefresh,
    canCreateStore, alertMaxStores, saveStore, deleteStore, toggleActive,
  } = useStoresCRUD();

  const { t } = useLanguage();

  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreType | null>(null);

  // Form state (reducer)
  const [form, formDispatch] = useReducer(formReducer, INITIAL_FORM);
  const { nom, categorie, ville, quartier, adresse, telephone, email, latitude, longitude, addressSearch, isGeoSearching, locating, showCategoryPicker } = form;
  const setForm = useCallback((payload: Partial<FormState>) => formDispatch({ type: 'SET', payload }), []);

  const mapRef = useRef<SafeMapViewRef>(null);
  const overviewMapRef = useRef<SafeMapViewRef>(null);

  // ── Stores with coordinates for overview map ──
  const storesWithCoords = useMemo(
    () => stores.filter((s) => s.latitude != null && s.longitude != null),
    [stores],
  );

  const overviewRegion = useMemo(() => {
    if (storesWithCoords.length === 0) {
      return { latitude: 33.5731, longitude: -7.5898, latitudeDelta: 0.5, longitudeDelta: 0.5 };
    }
    if (storesWithCoords.length === 1) {
      return {
        latitude: storesWithCoords[0].latitude!,
        longitude: storesWithCoords[0].longitude!,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    const lats = storesWithCoords.map((s) => s.latitude!);
    const lngs = storesWithCoords.map((s) => s.longitude!);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.02),
    };
  }, [storesWithCoords]);

  // ── Fit map to all stores when they change ──
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (storesWithCoords.length > 1 && overviewMapRef.current) {
      fitTimerRef.current = setTimeout(() => {
        overviewMapRef.current?.fitToCoordinates?.(
          storesWithCoords.map((s) => ({ latitude: s.latitude!, longitude: s.longitude! })),
          { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true },
        );
      }, 500);
    } else if (storesWithCoords.length === 1 && overviewMapRef.current) {
      overviewMapRef.current?.animateToRegion?.({
        latitude: storesWithCoords[0].latitude!,
        longitude: storesWithCoords[0].longitude!,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    }
    return () => clearTimeout(fitTimerRef.current);
  }, [storesWithCoords]);

  // ── Reset form ──
  const resetForm = () => {
    formDispatch({ type: 'RESET', defaults: { categorie: merchant?.categorie ?? '', ville: merchant?.ville ?? '' } });
    setEditingStore(null);
  };

  // ── Open modal ──
  const openCreate = () => {
    if (stores.length >= effectiveMax) {
      if (!isPremium) {
        setPremiumModal({ visible: true, titleKey: 'storesCrud.storesLockedTitle', descKey: 'storesCrud.storesLockedMsg' });
      } else {
        alertMaxStores();
      }
      return;
    }
    resetForm();
    setShowModal(true);
  };

  const openEdit = (store: StoreType) => {
    setEditingStore(store);
    formDispatch({ type: 'LOAD_STORE', store });
    setShowModal(true);
  };

  // ── Save ──
  const handleSave = async () => {
    const payload: Partial<CreateStorePayload> & { nom: string } = {
      nom: nom.trim(),
      ville: ville.trim() || undefined,
      quartier: quartier.trim() || undefined,
      adresse: adresse.trim() || undefined,
      telephone: telephone.trim() || undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      categorie: categorie || undefined,
    };
    const ok = await saveStore(payload as CreateStorePayload, editingStore?.id);
    if (ok) setShowModal(false);
  };

  // ── Delete ──
  const handleDelete = (store: StoreType) => deleteStore(store);

  // ── Geocoding helpers ──
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

  const handleAddressSearch = async () => {
    const q = addressSearch.trim();
    if (!q || q.length < 3) return;
    setForm({ isGeoSearching: true });
    try {
      const fullQuery = ville ? `${q}, ${ville}, ${t('common.morocco')}` : `${q}, ${t('common.morocco')}`;
      const results = await geocodeAsync(fullQuery);
      if (results.length > 0) {
        const { latitude: lat, longitude: lng } = results[0];
        setForm({ latitude: lat, longitude: lng, adresse: q });
        mapRef.current?.animateToRegion({
          latitude: lat, longitude: lng,
          latitudeDelta: 0.005, longitudeDelta: 0.005,
        });
        await reverseGeocodeAndLabel(lat, lng);
      } else {
        Alert.alert(t('stores.addressNotFound'), t('stores.addressNotFoundHint'));
      }
    } catch {
      Alert.alert(t('common.error'), t('stores.addressSearchError'));
    } finally {
      setForm({ isGeoSearching: false });
    }
  };

  const handleUseMyLocation = async () => {
    setForm({ locating: true });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('stores.permissionDenied'), t('stores.enableLocation'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setForm({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
      });
      await reverseGeocodeAndLabel(loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert(t('common.error'), t('stores.locationError'));
    } finally {
      setForm({ locating: false });
    }
  };

  // ── Category helper ──
  const getCategoryLabel = (cat?: MerchantCategory | '') => {
    if (!cat) return t('stores.sameCategoryLabel');
    return getCategoryLabelFn(cat);
  };

  // ── Main view ──
  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('stores.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Counter */}
      <View style={[styles.counterRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Store size={18} color={theme.primary} />
        <Text style={[styles.counterText, { color: theme.text }]}>
          {t('stores.counterLabel', { count: stores.length, max: effectiveMax })}
        </Text>
        {stores.length < MAX_STORES && (
          <TouchableOpacity
            style={[
              styles.addBtnSmall,
              { backgroundColor: stores.length >= effectiveMax ? theme.textMuted : theme.primary },
            ]}
            onPress={openCreate}
          >
            {stores.length >= effectiveMax && !isPremium
              ? <Lock size={14} color="#fff" />
              : <Plus size={16} color="#fff" />}
            <Text style={styles.addBtnSmallText}>
              {stores.length >= effectiveMax && !isPremium ? 'Pro' : t('stores.addStore')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Overview Map ── */}
      {!loading && storesWithCoords.length > 0 && (
        <View style={[styles.overviewMapWrapper, { borderColor: theme.border }]}>
          <MapView
            key={`overview-map-${storesWithCoords.length}`}
            ref={overviewMapRef}
            style={styles.overviewMap}
            provider={googleMapsApiKey ? PROVIDER_GOOGLE : undefined}
            region={overviewRegion}
            scrollEnabled={true}
            zoomEnabled={true}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            {storesWithCoords.map((store) => (
              <Marker
                key={store.id}
                coordinate={{ latitude: store.latitude!, longitude: store.longitude! }}
                title={store.nom}
                description={[store.adresse, store.quartier, store.ville].filter(Boolean).join(', ')}
              />
            ))}
          </MapView>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : stores.length === 0 ? (
        <View style={styles.centered}>
          <Store size={48} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('stores.noStores')}</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {t('stores.noStoresHint')}
          </Text>
          <TouchableOpacity style={[styles.addBtnLarge, { backgroundColor: theme.primary }]} onPress={openCreate}>
            <Plus size={20} color="#fff" />
            <Text style={styles.addBtnLargeText}>{t('stores.addStore')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              merchantCategorie={merchant?.categorie}
              onEdit={openEdit}
              onToggle={toggleActive}
              onDelete={handleDelete}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} style={{ flex: 1 }}>
          <View style={[styles.modalOverlay]}>
            <View style={[styles.modalContent, { backgroundColor: theme.bg, paddingTop: Math.max(insets.top, 16) }]}>
              {/* Modal header */}
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <X size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {editingStore ? t('stores.editStore') : t('stores.addStore')}
                </Text>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={theme.primary} /> : <Check size={24} color={theme.primary} />}
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
                {/* ── Section: Informations ── */}
                <View style={[styles.sectionHeader, { borderBottomColor: theme.border }]}>
                  <Tag size={16} color={theme.primary} />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('stores.sectionInfo')}</Text>
                </View>

                {/* Nom */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.nameLabel')} *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: nom.trim() ? theme.success : theme.border }]}>
                  <Store size={18} color={nom.trim() ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={nom}
                    onChangeText={(v) => setForm({ nom: v })}
                    placeholder={t('stores.namePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                  />
                  {nom.trim().length > 0 && <Check size={16} color={theme.success} strokeWidth={2.5} />}
                </View>

                {/* Catégorie */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
                <TouchableOpacity
                  style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: categorie ? theme.primary : theme.border }]}
                  onPress={() => setForm({ showCategoryPicker: true })}
                >
                  <MerchantCategoryIcon category={categorie || merchant?.categorie || MerchantCategory.AUTRE} size={22} />
                  <Text style={[styles.input, { color: categorie ? theme.text : theme.textMuted, flex: 1 }]}>
                    {getCategoryLabel(categorie)}
                  </Text>
                  <ChevronDown size={16} color={theme.textMuted} />
                </TouchableOpacity>

                {/* ── Section: Contact ── */}
                <View style={[styles.sectionHeader, { borderBottomColor: theme.border, marginTop: 20 }]}>
                  <Contact size={16} color={theme.primary} />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('stores.sectionContact')}</Text>
                </View>

                {/* Téléphone */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.phoneLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: telephone.trim().length >= 7 ? theme.success : theme.border }]}>
                  <Phone size={18} color={telephone.trim().length >= 7 ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={telephone}
                    onChangeText={(v) => setForm({ telephone: v })}
                    placeholder={t('stores.phonePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                  />
                  {telephone.trim().length >= 7 && <Check size={16} color={theme.success} strokeWidth={2.5} />}
                </View>

                {/* Email */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.emailLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: email && isValidEmail(email) ? theme.success : email.length > 3 && !isValidEmail(email) ? theme.danger : theme.border }]}>
                  <Mail size={18} color={email && isValidEmail(email) ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={email}
                    onChangeText={(v) => setForm({ email: v })}
                    placeholder={t('stores.emailPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {email && isValidEmail(email) && <Check size={16} color={theme.success} strokeWidth={2.5} />}
                </View>
                {email.length > 3 && !isValidEmail(email) && (
                  <Text style={[styles.validationHint, { color: theme.danger }]}>{t('stores.invalidEmail')}</Text>
                )}

                {/* ── Section: Localisation ── */}
                <View style={[styles.sectionHeader, { borderBottomColor: theme.border, marginTop: 20 }]}>
                  <MapPin size={16} color={theme.primary} />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('stores.sectionLocation')}</Text>
                </View>

                {/* Ville */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.cityLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: ville.trim() ? theme.success : theme.border }]}>
                  <MapPin size={18} color={ville.trim() ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={ville}
                    onChangeText={(v) => setForm({ ville: v })}
                    placeholder={t('stores.cityPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                  />
                  {ville.trim().length > 0 && <Check size={16} color={theme.success} strokeWidth={2.5} />}
                </View>

                {/* Quartier */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.districtLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: quartier.trim() ? theme.success : theme.border }]}>
                  <MapPin size={18} color={quartier.trim() ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={quartier}
                    onChangeText={(v) => setForm({ quartier: v })}
                    placeholder={t('stores.districtPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                {/* Address search with autocomplete */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.searchAddress')}</Text>
                <AddressAutocomplete
                  value={addressSearch}
                  onChangeText={(text) => { setForm({ addressSearch: text, adresse: text }); }}
                  placeholder={t('stores.addressSearchPlaceholder')}
                  ville={ville}
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
                      latitudeDelta: 0.005, longitudeDelta: 0.005,
                    });
                  }}
                />

                {/* Map */}
                <View style={[styles.mapWrapper, { borderColor: theme.border }]}>
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    provider={googleMapsApiKey ? PROVIDER_GOOGLE : undefined}
                    initialRegion={{
                      latitude: latitude ?? 33.5731,
                      longitude: longitude ?? -7.5898,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    }}
                    onPress={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                      const coords = e.nativeEvent.coordinate;
                      setForm({ latitude: coords.latitude, longitude: coords.longitude });
                      reverseGeocodeAndLabel(coords.latitude, coords.longitude);
                    }}
                  >
                    {latitude !== null && longitude !== null && (
                      <Marker
                        draggable
                        coordinate={{ latitude, longitude }}
                        onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                          const c = e.nativeEvent.coordinate;
                          setForm({ latitude: c.latitude, longitude: c.longitude });
                          reverseGeocodeAndLabel(c.latitude, c.longitude);
                        }}
                      />
                    )}
                  </MapView>
                </View>

                <TouchableOpacity
                  style={[styles.locationBtn, { backgroundColor: theme.primary }]}
                  onPress={handleUseMyLocation}
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Navigation size={16} color="#fff" strokeWidth={1.5} />
                      <Text style={styles.locationBtnText}>{t('stores.locateMe')}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* GPS indicator */}
                {latitude !== null && longitude !== null && (
                  <View style={[styles.gpsIndicator, { backgroundColor: `${theme.success}12` }]}>
                    <Check size={14} color={theme.success} strokeWidth={2.5} />
                    <Text style={[styles.gpsIndicatorText, { color: theme.success }]}>
                      📍 {adresse || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
                    </Text>
                  </View>
                )}

                {/* Adresse (readonly, filled by geocode) */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.addressLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: adresse.trim() ? theme.success : theme.border }]}>
                  <MapPin size={18} color={adresse.trim() ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={adresse}
                    onChangeText={(text) => setForm({ adresse: text })}
                    placeholder={t('stores.addressAutoPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Category Picker Modal ── */}
      <Modal visible={showCategoryPicker} animationType="fade" transparent>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setForm({ showCategoryPicker: false })}>
          <View style={[styles.pickerCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
            <ScrollView style={{ maxHeight: 350 }}>
              {getCategoryOptions().map((opt) => {
                const emoji = CATEGORY_EMOJIS[opt.value] ?? '🏷️';
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.pickerOption,
                      { borderColor: theme.border },
                      categorie === opt.value && { backgroundColor: theme.primary + '15', borderColor: theme.primary },
                    ]}
                    onPress={() => { setForm({ categorie: opt.value as MerchantCategory, showCategoryPicker: false }); }}
                  >
                    {emoji ? (
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                    ) : (
                      <MerchantCategoryIcon category={opt.value} size={26} />
                    )}
                    <Text style={[styles.pickerOptionText, { color: theme.text }]}>{opt.label}</Text>
                    {categorie === opt.value && <Check size={18} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <PremiumLockModal
        visible={premiumModal.visible}
        onClose={() => setPremiumModal(p => ({ ...p, visible: false }))}
        titleKey={premiumModal.titleKey}
        descKey={premiumModal.descKey}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  counterText: { flex: 1, fontSize: 14, fontWeight: '600' },
  addBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addBtnSmallText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  addBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 20,
  },
  addBtnLargeText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  listContent: { padding: 16, gap: 12, paddingBottom: 32 },

  // Card
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardHeader: { marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardDetail: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cardDetailText: { fontSize: 13, flex: 1 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  formContent: { paddingHorizontal: 20, paddingTop: 16 },

  // Form
  label: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  validationHint: { fontSize: 11, marginTop: 4, marginLeft: 4 },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    marginBottom: 4,
    marginTop: 8,
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  // Overview Map
  overviewMapWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    height: 180,
  },
  overviewMap: { width: '100%', height: '100%' },

  // Map
  mapWrapper: { borderRadius: 14, overflow: 'hidden', marginTop: 8, borderWidth: 1, height: 260 },
  map: { width: '100%', height: '100%' },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: '#1F2937', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  locationBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  gpsIndicatorText: { fontSize: 12, fontWeight: '500', flex: 1 },

  // Category picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  pickerCard: { borderRadius: 16, padding: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  pickerOptionText: { flex: 1, fontSize: 14, fontWeight: '500' },
});
