import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image as RNImage,
} from 'react-native';
// Reanimated removed — plain View shim
const Animated = { View } as const;
import MapView, { Marker, PROVIDER_GOOGLE, SafeMapViewRef } from '@/components/SafeMapView';
import * as Location from 'expo-location';
import { geocodeAsync, reverseGeocodeAsync } from '@/utils/geocodeCache';
import * as ImagePicker from 'expo-image-picker';
import { resolveImageUrl } from '@/utils/imageUrl';
import {
  ArrowLeft,
  Check,
  Store as StoreIcon,
  MapPin,
  FileText,
  Image,
  Camera,
  Search,
  X,
  Palette,
  Plus,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Phone,
  Navigation,
  Instagram,
  Globe,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import api, { getServerBaseUrl } from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { MerchantCategory, Store as StoreType } from '@/types';
import { CATEGORY_LABELS } from '@/constants/categories';
import { useStoresCRUD, MAX_STORES } from '@/hooks/useStoresCRUD';

import { VILLES } from '@/constants/villes';

// (Countries import removed — now per-store)

// ── Tab IDs ──────────────────────────────────────────────
type TabId = 'profile' | 'visual';

type PlacePrediction = {
  place_id: string;
  description: string;
};

type PlaceAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export default function EditProfileScreen() {
  const { merchant, updateMerchant } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const googleMapsApiKey =
    Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
    Constants.expoConfig?.extra?.googleMapsApiKey ||
    '';
  const mapRef = useRef<SafeMapViewRef>(null);

  const [activeTab, setActiveTab] = useState<TabId>(
    params.tab === 'visual' ? 'visual' : 'profile',
  );

  // ── Form state (profile global) ──
  const [nom, setNom] = useState(merchant?.nom ?? '');
  const [description, setDescription] = useState(merchant?.description ?? '');
  const [categorie, setCategorie] = useState<MerchantCategory>(
    merchant?.categorie ?? MerchantCategory.AUTRE,
  );
  const [logoUrl, setLogoUrl] = useState(merchant?.logoUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(merchant?.coverUrl ?? '');
  const [instagram, setInstagram] = useState(merchant?.socialLinks?.instagram ?? '');
  const [tiktok, setTiktok] = useState(merchant?.socialLinks?.tiktok ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const { t } = useLanguage();

  // ── Stores (shared hook) ──
  const {
    stores, loading: storesLoading, saving: storeSaving,
    canCreateStore, alertMaxStores, saveStore, deleteStore,
  } = useStoresCRUD({ silentLoadError: true });

  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [storeEditModal, setStoreEditModal] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreType | null>(null);

  // Store form fields
  const [sNom, setSNom] = useState('');
  const [sVille, setSVille] = useState('');
  const [sQuartier, setSQuartier] = useState('');
  const [sAdresse, setSAdresse] = useState('');
  const [sLatitude, setSLatitude] = useState<number | null>(null);
  const [sLongitude, setSLongitude] = useState<number | null>(null);
  const [sTelephone, setSTelephone] = useState('');
  const [sAddressSearch, setSAddressSearch] = useState('');
  const [sIsGeoSearching, setSIsGeoSearching] = useState(false);
  const [sLocating, setSLocating] = useState(false);
  const [sVilleSearch, setSVilleSearch] = useState('');
  const [sShowVilleDropdown, setSShowVilleDropdown] = useState(false);
  const storeMapRef = useRef<SafeMapViewRef>(null);

  // ── Mise à jour des champs quand merchant change ──
  useEffect(() => {
    if (merchant) {
      setNom(merchant.nom ?? '');
      setDescription(merchant.description ?? '');
      setCategorie(merchant.categorie ?? MerchantCategory.AUTRE);
      setLogoUrl(merchant.logoUrl ?? '');
      setInstagram(merchant.socialLinks?.instagram ?? '');
      setTiktok(merchant.socialLinks?.tiktok ?? '');
    }
  }, [merchant]);

  const sFilteredVilles = sVilleSearch
    ? VILLES.filter((v) => v.toLowerCase().includes(sVilleSearch.toLowerCase()))
    : VILLES;

  // ── Store geocoding helpers ──
  const storeReverseGeocode = async (lat: number, lng: number) => {
    try {
      const [geo] = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (!geo) return;
      const parts = [geo.street, geo.name, geo.district, geo.subregion].filter(Boolean);
      if (parts.length > 0) { setSAdresse(parts.join(', ')); setSAddressSearch(parts.join(', ')); }
      if (geo.city) setSVille(geo.city);
      if (geo.district) setSQuartier(geo.district);
    } catch (error) {
      if (__DEV__) console.warn('[EditProfile] Échec du géocodage inversé:', error);
    }
  };

  const storeAddressSearch = async (query?: string) => {
    const q = (query ?? sAdresse).trim();
    if (!q || q.length < 3) return;
    setSIsGeoSearching(true);
    try {
      const fullQuery = sVille ? `${q}, ${sVille}, Maroc` : `${q}, Maroc`;
      const results = await geocodeAsync(fullQuery);
      if (results.length > 0) {
        const { latitude: lat, longitude: lng } = results[0];
        setSLatitude(lat);
        setSLongitude(lng);
        setSAdresse(q);
        storeMapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 });
        await storeReverseGeocode(lat, lng);
      } else {
        Alert.alert('Adresse non trouvée', 'Essayez avec plus de détails.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de rechercher cette adresse.');
    } finally { setSIsGeoSearching(false); }
  };

  const storeUseMyLocation = async () => {
    setSLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission refusée', 'Activez la localisation.'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      setSLatitude(loc.coords.latitude);
      setSLongitude(loc.coords.longitude);
      storeMapRef.current?.animateToRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      await storeReverseGeocode(loc.coords.latitude, loc.coords.longitude);
    } catch { Alert.alert('Erreur', 'Impossible d\'obtenir la position.'); }
    finally { setSLocating(false); }
  };

  // ── Store form helpers ──
  const resetStoreForm = () => {
    setSNom(''); setSVille(merchant?.ville ?? ''); setSQuartier(''); setSAdresse('');
    setSLatitude(null); setSLongitude(null); setSTelephone(''); setSAddressSearch('');
    setEditingStore(null); setSVilleSearch(''); setSShowVilleDropdown(false);
  };

  const openCreateStore = () => {
    if (!canCreateStore) { alertMaxStores(); return; }
    resetStoreForm();
    setStoreEditModal(true);
  };

  const openEditStore = (store: StoreType) => {
    setEditingStore(store);
    setSNom(store.nom); setSVille(store.ville ?? ''); setSQuartier(store.quartier ?? '');
    setSAdresse(store.adresse ?? ''); setSLatitude(store.latitude ?? null);
    setSLongitude(store.longitude ?? null); setSTelephone(store.telephone ?? '');
    setSAddressSearch(store.adresse ?? '');
    setStoreEditModal(true);
  };

  const handleSaveStore = async () => {
    const payload: Record<string, any> = {
      nom: sNom.trim(),
      ville: sVille.trim() || undefined,
      quartier: sQuartier.trim() || undefined,
      adresse: sAdresse.trim() || undefined,
      telephone: sTelephone.trim() || undefined,
      latitude: sLatitude ?? undefined,
      longitude: sLongitude ?? undefined,
    };
    const ok = await saveStore(payload, editingStore?.id);
    if (ok) setStoreEditModal(false);
  };

  const handleDeleteStore = (store: StoreType) => deleteStore(store);

  // ── Pick & Upload image ──────────────────────────────────────────────
  const pickAndUploadImage = async (type: 'logo' | 'cover') => {
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingCover;
    const setUrl = type === 'logo' ? setLogoUrl : setCoverUrl;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'logo' ? [1, 1] : [3, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploading(true);
      const asset = result.assets[0];
      const formData = new FormData();
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      formData.append('file', {
        uri: asset.uri,
        name: `${type}.${ext}`,
        type: asset.mimeType ?? `image/${ext}`,
      } as any);

      const res = await api.post(`/merchant/upload-image?type=${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUrl(res.data.url);
      updateMerchant({ ...merchant!, [res.data.field]: res.data.url });
    } catch (err: unknown) {
      Alert.alert('Erreur', getErrorMessage(err, "Impossible d'envoyer l'image"));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (type: 'logo' | 'cover') => {
    const setUrl = type === 'logo' ? setLogoUrl : setCoverUrl;
    const field = type === 'logo' ? 'logoUrl' : 'coverUrl';
    try {
      await api.patch('/merchant/profile', { [field]: null });
      setUrl('');
      updateMerchant({ ...merchant!, [field]: null });
    } catch {
      Alert.alert('Erreur', "Impossible de supprimer l'image");
    }
  };

  // ── Save (profile global) ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!nom.trim()) {
      Alert.alert(t('common.error'), 'Le nom du commerce est obligatoire');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (activeTab === 'profile') {
        payload.nom = nom.trim();
        payload.description = description.trim() || undefined;
        payload.categorie = categorie;
        payload.socialLinks = {
          instagram: instagram.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '') || undefined,
          tiktok: tiktok.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '') || undefined,
        };
      }
      // Visual tab images are uploaded instantly via pickAndUploadImage
      // Only save profile fields here
      if (Object.keys(payload).length === 0) {
        router.back();
        return;
      }

      const res = await api.patch('/merchant/profile', payload);
      updateMerchant(res.data);
      Alert.alert(t('editProfile.saveSuccess'));
      router.back();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('editProfile.saveError')));
    } finally {
      setSaving(false);
    }
  };

  // ── Tab Bar ────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: t('editProfile.tabProfile'), icon: <StoreIcon size={16} color={activeTab === 'profile' ? '#fff' : theme.textMuted} /> },
    { id: 'visual', label: t('editProfile.tabVisual'), icon: <Palette size={16} color={activeTab === 'visual' ? '#fff' : theme.textMuted} /> },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ─────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('editProfile.title')}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: theme.primary }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Check size={20} color="#fff" strokeWidth={1.5} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Tab Switcher ───────────────────────── */}
      <View style={[styles.tabBar, { backgroundColor: theme.bgCard }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                isActive && { backgroundColor: theme.primary },
              ]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              {tab.icon}
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? '#fff' : theme.textMuted },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'profile' ? (
          <Animated.View key="profile">
            {/* Nom */}
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.nameLabel')} *</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <StoreIcon size={18} color={theme.textMuted} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={nom}
                onChangeText={setNom}
                placeholder="Ex: Café Panorama"
                placeholderTextColor={theme.textMuted}
              />
            </View>

            {/* Description */}
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.descLabel')}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, minHeight: 90, alignItems: 'flex-start' }]}>
              <FileText size={18} color={theme.textMuted} style={{ marginTop: 12 }} />
              <TextInput
                style={[styles.input, { color: theme.text, textAlignVertical: 'top', minHeight: 70 }]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('editProfile.descPlaceholder')}
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={200}
              />
            </View>
            <Text style={[styles.charCount, { color: theme.textMuted }]}>
              {description.length}/200
            </Text>

            {/* Réseaux sociaux */}
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.socialLinksLabel')}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, marginBottom: 10 }]}>
              <Instagram size={18} color="#E1306C" />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={instagram}
                onChangeText={setInstagram}
                placeholder={t('editProfile.instagramPlaceholder')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <Globe size={18} color={theme.text} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={tiktok}
                onChangeText={setTiktok}
                placeholder={t('editProfile.tiktokPlaceholder')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Catégorie */}
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.categoryLabel')}</Text>
            <View style={styles.categoryGrid}>
              {(Object.keys(CATEGORY_LABELS) as MerchantCategory[]).map((key) => {
                const { label, emoji } = CATEGORY_LABELS[key];
                const isSelected = categorie === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isSelected ? theme.primary + '15' : theme.bgInput,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setCategorie(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryEmoji}>{emoji}</Text>
                    <Text
                      style={[
                        styles.categoryLabel,
                        { color: isSelected ? theme.primary : theme.text },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ═══ Mes Magasins ═══ */}
            <View style={[styles.storesSectionHeader, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
              <StoreIcon size={20} color={theme.primary} />
              <Text style={[styles.storesSectionTitle, { color: theme.text }]}>
                {t('editProfile.storesSection')} ({stores.length}/{MAX_STORES})
              </Text>
              {stores.length < MAX_STORES && (
                <TouchableOpacity style={[styles.addStoreBtn, { backgroundColor: theme.primary }]} onPress={openCreateStore}>
                  <Plus size={16} color="#fff" />
                  <Text style={styles.addStoreBtnText}>{t('editProfile.addStore')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {storesLoading ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 16 }} />
            ) : stores.length === 0 ? (
              <TouchableOpacity
                style={[styles.emptyStoreCard, { borderColor: theme.border, backgroundColor: theme.bgInput }]}
                onPress={openCreateStore}
              >
                <Plus size={28} color={theme.textMuted} />
                <Text style={[styles.emptyStoreText, { color: theme.textMuted }]}>
                  Ajoutez votre premier magasin
                </Text>
                <Text style={[styles.emptyStoreHint, { color: theme.textMuted }]}>
                  Adresse, ville, téléphone et position GPS
                </Text>
              </TouchableOpacity>
            ) : (
              stores.map((store, idx) => {
                const isExpanded = expandedStoreId === store.id;
                return (
                  <View key={store.id} style={[styles.storeCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
                    <TouchableOpacity
                      style={styles.storeCardHeader}
                      onPress={() => setExpandedStoreId(isExpanded ? null : store.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.storeCardName, { color: theme.text }]}>{store.nom}</Text>
                        <Text style={[styles.storeCardSub, { color: theme.textMuted }]} numberOfLines={1}>
                          {[store.adresse, store.quartier, store.ville].filter(Boolean).join(', ') || 'Aucune adresse'}
                        </Text>
                      </View>
                      {isExpanded ? <ChevronUp size={20} color={theme.textMuted} /> : <ChevronDown size={20} color={theme.textMuted} />}
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={[styles.storeCardBody, { borderTopColor: theme.border }]}>
                        {store.telephone ? (
                          <View style={styles.storeDetailRow}>
                            <Phone size={14} color={theme.textMuted} />
                            <Text style={[styles.storeDetailText, { color: theme.textMuted }]}>{store.telephone}</Text>
                          </View>
                        ) : null}
                        {store.latitude && store.longitude ? (
                          <View style={styles.storeDetailRow}>
                            <Navigation size={14} color={theme.textMuted} />
                            <Text style={[styles.storeDetailText, { color: theme.textMuted }]}>
                              {store.latitude.toFixed(5)}, {store.longitude.toFixed(5)}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.storeCardActions}>
                          <TouchableOpacity
                            style={[styles.storeActionBtn, { backgroundColor: theme.primary + '12' }]}
                            onPress={() => openEditStore(store)}
                          >
                            <Edit3 size={15} color={theme.primary} />
                            <Text style={[styles.storeActionText, { color: theme.primary }]}>{t('stores.editBtn')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.storeActionBtn, { backgroundColor: '#fef2f2' }]}
                            onPress={() => handleDeleteStore(store)}
                          >
                            <Trash2 size={15} color="#dc2626" />
                            <Text style={[styles.storeActionText, { color: '#dc2626' }]}>{t('common.delete')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </Animated.View>
        ) : (
          <Animated.View key="visual">
            {/* Logo */}
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.logoLabel')}</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              L'image s'affichera sur le téléphone de vos clients (carré, max 2 Mo)
            </Text>

            {logoUrl.trim().length > 0 ? (
              <View style={[styles.imagePreviewContainer, { borderColor: theme.border }]}>
                <RNImage
                  source={{ uri: resolveImageUrl(logoUrl) }}
                  style={styles.logoPreview}
                />
                <View style={styles.imageActions}>
                  <TouchableOpacity
                    style={[styles.imageActionBtn, { backgroundColor: theme.primary + '15' }]}
                    onPress={() => pickAndUploadImage('logo')}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <>
                        <Image size={16} color={theme.primary} />
                        <Text style={[styles.imageActionText, { color: theme.primary }]}>{t('editProfile.changePhoto')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.imageActionBtn, { backgroundColor: '#fef2f2' }]}
                    onPress={() => removeImage('logo')}
                  >
                    <Trash2 size={16} color="#dc2626" />
                    <Text style={[styles.imageActionText, { color: '#dc2626' }]}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.uploadPlaceholder, { borderColor: theme.border, backgroundColor: theme.bgInput }]}
                onPress={() => pickAndUploadImage('logo')}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <>
                    <View style={[styles.uploadIconCircle, { backgroundColor: theme.primary + '15' }]}>
                      <Image size={28} color={theme.primary} />
                    </View>
                    <Text style={[styles.uploadText, { color: theme.text }]}>Ajouter un logo</Text>
                    <Text style={[styles.uploadHint, { color: theme.textMuted }]}>JPG, PNG ou WebP • max 2 Mo</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Info */}
            <View style={[styles.infoBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' }]}>
              <Text style={[styles.infoText, { color: theme.primary }]}>
                💡 Conseil : Utilisez une image carrée pour le logo (512×512 px).
              </Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* ═══ Store Edit Modal ═══ */}
      <Modal visible={storeEditModal} animationType="slide" transparent={false} onRequestClose={() => setStoreEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.cpContainer, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
            {/* Header */}
            <View style={[styles.cpHeader, { backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight }]}>
              <TouchableOpacity onPress={() => setStoreEditModal(false)} style={{ padding: 4 }}>
                <ArrowLeft size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.cpTitle, { color: theme.text }]}>
                {editingStore ? t('stores.editStore') : t('editProfile.addStore')}
              </Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {/* Nom */}
              <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.storeNameLabel')} *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <StoreIcon size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={sNom}
                  onChangeText={setSNom}
                  placeholder="Ex: Boutique Maarif"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              {/* Ville */}
              <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.storeCityLabel')}</Text>
              <TouchableOpacity
                style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}
                onPress={() => setSShowVilleDropdown(!sShowVilleDropdown)}
                activeOpacity={0.7}
              >
                <MapPin size={18} color={theme.textMuted} />
                <Text style={[styles.input, { color: sVille ? theme.text : theme.textMuted, paddingVertical: 14 }]}>
                  {sVille || 'Sélectionner une ville'}
                </Text>
              </TouchableOpacity>

              {sShowVilleDropdown && (
                <Animated.View style={[styles.dropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                  <View style={[styles.searchRow, { borderBottomColor: theme.borderLight }]}>
                    <Search size={16} color={theme.textMuted} />
                    <TextInput
                      style={[styles.searchInput, { color: theme.text }]}
                      value={sVilleSearch}
                      onChangeText={setSVilleSearch}
                      placeholder="Rechercher une ville..."
                      placeholderTextColor={theme.textMuted}
                      autoFocus
                    />
                    {sVilleSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setSVilleSearch('')}>
                        <X size={16} color={theme.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {sFilteredVilles.map((v: string) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.villeOption, sVille === v && { backgroundColor: theme.primary + '10' }]}
                        onPress={() => { setSVille(v); setSShowVilleDropdown(false); setSVilleSearch(''); }}
                      >
                        <Text style={[styles.villeText, { color: sVille === v ? theme.primary : theme.text }]}>{v}</Text>
                        {sVille === v && <Check size={16} color={theme.primary} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </Animated.View>
              )}

              {/* Adresse */}
              <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.storeAddressLabel')}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <Search size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={sAdresse}
                  onChangeText={setSAdresse}
                  placeholder="Tapez une adresse ou lieu..."
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={() => storeAddressSearch(sAdresse)}
                />
                {sIsGeoSearching ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <TouchableOpacity onPress={() => storeAddressSearch(sAdresse)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MapPin size={20} color={theme.primary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Map */}
              <View style={[styles.mapWrapper, { borderColor: theme.border }]}>
                <MapView
                  ref={storeMapRef}
                  style={styles.map}
                  provider={googleMapsApiKey ? PROVIDER_GOOGLE : undefined}
                  initialRegion={{
                    latitude: sLatitude ?? 33.5731,
                    longitude: sLongitude ?? -7.5898,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  onPress={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                    const coords = e.nativeEvent.coordinate;
                    setSLatitude(coords.latitude);
                    setSLongitude(coords.longitude);
                    storeReverseGeocode(coords.latitude, coords.longitude);
                  }}
                >
                  {sLatitude !== null && sLongitude !== null && (
                    <Marker
                      draggable
                      coordinate={{ latitude: sLatitude, longitude: sLongitude }}
                      onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                        const lat = e.nativeEvent.coordinate.latitude;
                        const lng = e.nativeEvent.coordinate.longitude;
                        setSLatitude(lat);
                        setSLongitude(lng);
                        storeReverseGeocode(lat, lng);
                      }}
                    />
                  )}
                </MapView>
              </View>

              <TouchableOpacity
                style={[styles.locationBtn, { backgroundColor: theme.primary }]}
                onPress={storeUseMyLocation}
                disabled={sLocating}
              >
                {sLocating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MapPin size={16} color="#fff" strokeWidth={1.5} />
                    <Text style={styles.locationBtnText}>{t('editProfile.locateMe')}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Quartier */}
              <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.storeDistrictLabel')}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <MapPin size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={sQuartier}
                  onChangeText={setSQuartier}
                  placeholder="Ex: Maarif, Guéliz, Agdal..."
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              {/* Téléphone */}
              <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.storePhoneLabel')}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <Phone size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={sTelephone}
                  onChangeText={setSTelephone}
                  placeholder="0612345678"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Save */}
              <TouchableOpacity
                style={[styles.storeSaveBtn, { backgroundColor: theme.primary, opacity: storeSaving ? 0.6 : 1 }]}
                onPress={handleSaveStore}
                disabled={storeSaving}
              >
                {storeSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.storeSaveBtnText}>{editingStore ? t('editProfile.saveBtn') : t('editProfile.addStore')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12 },
  saveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Tabs ──
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  tabLabel: { fontSize: 14, fontWeight: '600' },

  // ── Form ──
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 6,
  },
  hint: { fontSize: 12, marginBottom: 8, lineHeight: 16 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 13,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },

  // ── Category grid ──
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 4,
  },
  categoryEmoji: { fontSize: 16 },
  categoryLabel: { fontSize: 13, fontWeight: '600' },

  // ── Ville dropdown ──
  dropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  villeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  villeText: { fontSize: 14, fontWeight: '500' },

  // ── Adresse + Map ──
  addressOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  addressText: { fontSize: 14 },
  mapWrapper: {
    height: 180,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 10,
  },
  map: { flex: 1 },
  locationBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  locationBtnText: {
    color: '#fff',
    fontWeight: '700',
  },

  // ── Phone International ──
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  countrySelector: {
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryName: {
    fontSize: 15,
    fontWeight: '600',
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },

  // ── Stores section ──
  storesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  storesSectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  addStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addStoreBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyStoreCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    marginBottom: 8,
    gap: 6,
  },
  emptyStoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyStoreHint: {
    fontSize: 12,
  },
  storeCard: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  storeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  storeCardName: {
    fontSize: 15,
    fontWeight: '600',
  },
  storeCardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  storeCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 10,
  },
  storeDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storeDetailText: {
    fontSize: 13,
  },
  storeCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  storeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  storeActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  storeSaveBtn: {
    marginTop: 24,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeSaveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Visual preview ──
  previewBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  previewCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  previewLabel: { fontSize: 13, fontWeight: '600' },
  previewUrl: { fontSize: 11, marginTop: 4 },

  // ── Image upload ──
  imagePreviewContainer: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  logoPreview: {
    width: '100%',
    height: 160,
    resizeMode: 'contain',
    backgroundColor: '#f8f9fa',
  },
  imageActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  imageActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  imageActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  uploadPlaceholder: {
    marginTop: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    height: 160,
  },
  uploadIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  uploadText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  uploadHint: {
    fontSize: 12,
    marginTop: 4,
  },

  // ── Info box ──
  infoBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { fontSize: 13, lineHeight: 20 },

  // ── Modal Header (reused for store modal) ──
  cpContainer: { flex: 1 },
  cpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cpTitle: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12 },
});
