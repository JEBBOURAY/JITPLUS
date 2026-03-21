import React, { useState, useRef, useMemo, useEffect } from 'react';
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
} from 'lucide-react-native';
import MapView, { Marker, PROVIDER_GOOGLE, SafeMapViewRef } from '@/components/SafeMapView';
import * as Location from 'expo-location';
import { geocodeAsync, reverseGeocodeAsync } from '@/utils/geocodeCache';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Store as StoreType, MerchantCategory, CreateStorePayload } from '@/types';
import MerchantCategoryIcon, { useCategoryMetadata, CATEGORY_OPTIONS } from '@/components/MerchantCategoryIcon';
import { useStoresCRUD, MAX_STORES } from '@/hooks/useStoresCRUD';

const googleMapsApiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey ?? '';

/** Extracted as a proper component so hooks (useCategoryMetadata) are valid */
function StoreCard({ store, merchantCategorie, theme, onEdit, onToggle, onDelete }: {
  store: StoreType;
  merchantCategorie?: MerchantCategory;
  theme: ReturnType<typeof useTheme>;
  onEdit: (s: StoreType) => void;
  onToggle: (s: StoreType) => void;
  onDelete: (s: StoreType) => void;
}) {
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
}

export default function StoresScreen() {
  const theme = useTheme();
  const { merchant } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    stores, loading, refreshing, saving, onRefresh,
    canCreateStore, alertMaxStores, saveStore, deleteStore, toggleActive,
  } = useStoresCRUD();

  const { t } = useLanguage();

  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreType | null>(null);

  // Form state
  const [nom, setNom] = useState('');
  const [categorie, setCategorie] = useState<MerchantCategory | ''>('');
  const [ville, setVille] = useState('');
  const [quartier, setQuartier] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [addressSearch, setAddressSearch] = useState('');
  const [isGeoSearching, setIsGeoSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

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
  useEffect(() => {
    if (storesWithCoords.length > 1 && overviewMapRef.current) {
      setTimeout(() => {
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
  }, [storesWithCoords]);

  // ── Reset form ──
  const resetForm = () => {
    setNom('');
    setCategorie(merchant?.categorie ?? '');
    setVille(merchant?.ville ?? '');
    setQuartier('');
    setAdresse('');
    setTelephone('');
    setEmail('');
    setLatitude(null);
    setLongitude(null);
    setAddressSearch('');
    setEditingStore(null);
  };

  // ── Open modal ──
  const openCreate = () => {
    if (!canCreateStore) { alertMaxStores(); return; }
    resetForm();
    setShowModal(true);
  };

  const openEdit = (store: StoreType) => {
    setEditingStore(store);
    setNom(store.nom);
    setCategorie(store.categorie ?? '');
    setVille(store.ville ?? '');
    setQuartier(store.quartier ?? '');
    setAdresse(store.adresse ?? '');
    setTelephone(store.telephone ?? '');
    setEmail(store.email ?? '');
    setLatitude(store.latitude ?? null);
    setLongitude(store.longitude ?? null);
    setAddressSearch(store.adresse ?? '');
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
        if (parts.length > 0) setAdresse(parts.join(', '));
        if (g.city) setVille(g.city);
        if (g.district) setQuartier(g.district);
        setAddressSearch(parts.join(', '));
      }
    } catch { /* silently ignore */ }
  };

  const handleAddressSearch = async () => {
    const q = addressSearch.trim();
    if (!q || q.length < 3) return;
    setIsGeoSearching(true);
    try {
      const fullQuery = ville ? `${q}, ${ville}, Maroc` : `${q}, Maroc`;
      const results = await geocodeAsync(fullQuery);
      if (results.length > 0) {
        const { latitude: lat, longitude: lng } = results[0];
        setLatitude(lat);
        setLongitude(lng);
        setAdresse(q);
        mapRef.current?.animateToRegion({
          latitude: lat, longitude: lng,
          latitudeDelta: 0.005, longitudeDelta: 0.005,
        });
        await reverseGeocodeAndLabel(lat, lng);
      } else {
        Alert.alert('Adresse non trouvée', 'Essayez avec plus de détails.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de rechercher cette adresse.');
    } finally {
      setIsGeoSearching(false);
    }
  };

  const handleUseMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Activez la localisation.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
      });
      await reverseGeocodeAndLabel(loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'obtenir la position.');
    } finally {
      setLocating(false);
    }
  };

  // ── Category helper ──
  const getCategoryLabel = (cat?: MerchantCategory | '') => {
    if (!cat) return 'Même catégorie';
    const found = CATEGORY_OPTIONS.find((c) => c.value === cat);
    return found?.label ?? cat;
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
          {stores.length} / {MAX_STORES} magasins
        </Text>
        {stores.length < MAX_STORES && (
          <TouchableOpacity style={[styles.addBtnSmall, { backgroundColor: theme.primary }]} onPress={openCreate}>
            <Plus size={16} color="#fff" />
            <Text style={styles.addBtnSmallText}>{t('stores.addStore')}</Text>
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
              theme={theme}
              onEdit={openEdit}
              onToggle={toggleActive}
              onDelete={handleDelete}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
                {/* Nom */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.nameLabel')} *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Store size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={nom}
                    onChangeText={setNom}
                    placeholder="ex: Boutique Centre-Ville"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                {/* Catégorie */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
                <TouchableOpacity
                  style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}
                  onPress={() => setShowCategoryPicker(true)}
                >
                  <MerchantCategoryIcon category={categorie || merchant?.categorie || MerchantCategory.AUTRE} size={22} />
                  <Text style={[styles.input, { color: categorie ? theme.text : theme.textMuted }]}>
                    {getCategoryLabel(categorie)}
                  </Text>
                </TouchableOpacity>

                {/* Téléphone */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.phoneLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Phone size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={telephone}
                    onChangeText={setTelephone}
                    placeholder="06 XX XX XX XX"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                  />
                </View>

                {/* Email */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.emailLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Mail size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="boutique@example.com"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Ville */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.cityLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <MapPin size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={ville}
                    onChangeText={setVille}
                    placeholder="Casablanca"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                {/* Quartier */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.districtLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <MapPin size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={quartier}
                    onChangeText={setQuartier}
                    placeholder="Maârif, Gauthier..."
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                {/* Address search */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.searchAddress')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Search size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={addressSearch}
                    onChangeText={(t) => { setAddressSearch(t); setAdresse(t); }}
                    placeholder="Tapez une adresse, rue ou lieu..."
                    placeholderTextColor={theme.textMuted}
                    returnKeyType="search"
                    onSubmitEditing={handleAddressSearch}
                  />
                  {isGeoSearching ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <TouchableOpacity onPress={handleAddressSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MapPin size={20} color={theme.primary} />
                    </TouchableOpacity>
                  )}
                </View>

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
                      setLatitude(coords.latitude);
                      setLongitude(coords.longitude);
                      reverseGeocodeAndLabel(coords.latitude, coords.longitude);
                    }}
                  >
                    {latitude !== null && longitude !== null && (
                      <Marker
                        draggable
                        coordinate={{ latitude, longitude }}
                        onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                          const c = e.nativeEvent.coordinate;
                          setLatitude(c.latitude);
                          setLongitude(c.longitude);
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

                {/* Adresse (readonly, filled by geocode) */}
                <Text style={[styles.label, { color: theme.text }]}>{t('stores.addressLabel')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <MapPin size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={adresse}
                    onChangeText={setAdresse}
                    placeholder="Remplie automatiquement ou saisissez..."
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
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)}>
          <View style={[styles.pickerCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
            <ScrollView style={{ maxHeight: 350 }}>
              {CATEGORY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.pickerOption,
                    { borderColor: theme.border },
                    categorie === opt.value && { backgroundColor: theme.primary + '15', borderColor: theme.primary },
                  ]}
                  onPress={() => { setCategorie(opt.value as MerchantCategory); setShowCategoryPicker(false); }}
                >
                  <MerchantCategoryIcon category={opt.value} size={26} />
                  <Text style={[styles.pickerOptionText, { color: theme.text }]}>{opt.label}</Text>
                  {categorie === opt.value && <Check size={18} color={theme.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
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
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15 },

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
  mapWrapper: { borderRadius: 12, overflow: 'hidden', marginTop: 8, borderWidth: 1, height: 200 },
  map: { width: '100%', height: '100%' },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  locationBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

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
