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
  Image as RNImage,
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
  ToggleLeft,
  ToggleRight,
  Navigation,
  Tag,
  Contact,
  ChevronDown,
  Shield,
  FileText,
  Instagram,
  Globe,
} from 'lucide-react-native';
import PhoneInput from '@/components/PhoneInput';
import MapView, { Marker, SafeMapViewRef } from '@/components/SafeMapView';
import AddressAutocomplete, { AddressResult } from '@/components/AddressAutocomplete';
import * as Location from 'expo-location';
import { reverseGeocodeAsync } from '@/utils/geocodeCache';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Store as StoreType, MerchantCategory, CreateStorePayload } from '@/types';
import MerchantCategoryIcon, { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import { getCategoryLabel as getCategoryLabelFn, getCategoryOptions, CATEGORY_EMOJIS } from '@/constants/categories';
import { useStoresCRUD, MAX_STORES } from '@/hooks/useStoresCRUD';
import { isValidEmail } from '@/utils/validation';
import PremiumLockModal from '@/components/PremiumLockModal';
import MerchantLogo from '@/components/MerchantLogo';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import { palette, brandGradient } from '@/contexts/ThemeContext';
import { resolveImageUrl } from '@/utils/imageUrl';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const JITPRO_LOGO = require('@/assets/images/jitplusprologo.png');

/**
 * Premium map style — matching jitplus Discover screen.
 * Warm ivory tones with violet-tinted water.
 */
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

const MARKER_SIZE = ms(38);
const MARKER_LOGO = ms(26);
// 5 km ≈ 0.045° latitude delta
const FIVE_KM_DELTA = 0.045;

/** Custom map marker with merchant logo + Android bitmap tracking */
const TrackedStoreMarker = React.memo(function TrackedStoreMarker({
  store, logoUrl,
}: { store: StoreType; logoUrl?: string | null }) {
  const [error, setError] = useState(false);
  const [tracking, setTracking] = useState(Platform.OS === 'android');

  useEffect(() => {
    if (!tracking) return;
    const t = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(t);
  }, [tracking]);

  const source = logoUrl && !error
    ? { uri: resolveImageUrl(logoUrl) }
    : JITPRO_LOGO;

  return (
    <Marker
      coordinate={{ latitude: store.latitude!, longitude: store.longitude! }}
      title={store.nom}
      description={[store.adresse, store.quartier, store.ville].filter(Boolean).join(', ')}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
    >
      <View collapsable={false} style={markerStyles.root}>
        <RNImage
          source={source}
          style={markerStyles.logo}
          resizeMode="cover"
          onLoad={() => { if (tracking) setTimeout(() => setTracking(false), 100); }}
          onError={() => setError(true)}
        />
      </View>
    </Marker>
  );
});

const markerStyles = StyleSheet.create({
  root: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: ms(10),
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: palette.violet, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: { elevation: 6 },
    }),
  },
  logo: {
    width: MARKER_LOGO,
    height: MARKER_LOGO,
    borderRadius: ms(6),
  },
});

/** Extracted as a proper React.memo component â€” theme consumed internally */
const StoreCard = React.memo(function StoreCard({ store, merchantCategorie, isReference, onEdit, onToggle, onDelete }: {
  store: StoreType;
  merchantCategorie?: MerchantCategory;
  isReference?: boolean;
  onEdit: (s: StoreType) => void;
  onToggle: (s: StoreType) => void;
  onDelete: (s: StoreType) => void;
}) {
  const theme = useTheme();
  const cat = store.categorie ?? merchantCategorie ?? MerchantCategory.AUTRE;
  const { label: catLabel } = useCategoryMetadata(cat);
  const { t } = useLanguage();

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
      {/* Premium left accent bar */}
      <View style={[styles.cardAccent, { backgroundColor: store.isActive ? palette.violet : theme.textMuted }]} />

      <View style={styles.cardBody}>
        {/* Top row: avatar + info + status */}
        <View style={styles.cardTopRow}>
          <View style={[styles.cardAvatar, { backgroundColor: palette.violet + '10' }]}>
            <MerchantCategoryIcon category={cat} size={ms(28)} />
          </View>
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: ms(6) }}>
              <Text style={[styles.cardName, { color: theme.text, flex: 1 }]} numberOfLines={1}>{store.nom}</Text>
              {isReference && (
                <View style={[styles.referenceBadge, { backgroundColor: palette.violet + '14' }]}>
                  <Shield size={ms(10)} color={palette.violet} strokeWidth={2} />
                  <Text style={[styles.referenceBadgeText, { color: palette.violet }]}>{t('stores.referenceLabel')}</Text>
                </View>
              )}
            </View>
            <View style={[styles.cardCatBadge, { backgroundColor: palette.violet + '12' }]}>
              <Text style={[styles.cardCatText, { color: palette.violet }]}>{catLabel}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: store.isActive ? palette.violet + '14' : `${theme.danger}14` }]}>
            <Text style={{ fontSize: ms(10), fontWeight: '700', color: store.isActive ? palette.violet : theme.danger }}>
              {store.isActive ? t('stores.active') : t('stores.inactive')}
            </Text>
          </View>
        </View>

        {/* Details */}
        {store.adresse ? (
          <View style={styles.cardDetail}>
            <MapPin size={ms(12)} color={theme.textMuted} strokeWidth={1.5} />
            <Text style={[styles.cardDetailText, { color: theme.textMuted }]} numberOfLines={1}>
              {[store.adresse, store.quartier, store.ville].filter(Boolean).join(', ')}
            </Text>
          </View>
        ) : null}

        {store.telephone ? (
          <View style={styles.cardDetail}>
            <Phone size={ms(12)} color={theme.textMuted} strokeWidth={1.5} />
            <Text style={[styles.cardDetailText, { color: theme.textMuted }]}>{store.telephone}</Text>
          </View>
        ) : null}

        {store.email ? (
          <View style={styles.cardDetail}>
            <Mail size={ms(12)} color={theme.textMuted} strokeWidth={1.5} />
            <Text style={[styles.cardDetailText, { color: theme.textMuted }]}>{store.email}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.cardActions}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: palette.violet + '10' }]} onPress={() => onEdit(store)}>
            <Edit3 size={ms(14)} color={palette.violet} strokeWidth={1.5} />
            <Text style={[styles.actionBtnText, { color: palette.violet }]}>{t('stores.editBtn')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: store.isActive ? palette.violet + '10' : theme.bgInput }]} onPress={() => onToggle(store)}>
            {store.isActive
              ? <ToggleRight size={ms(14)} color={palette.violet} strokeWidth={1.5} />
              : <ToggleLeft size={ms(14)} color={theme.textMuted} strokeWidth={1.5} />}
            <Text style={[styles.actionBtnText, { color: store.isActive ? palette.violet : theme.textMuted }]}>
              {store.isActive ? t('stores.active') : t('stores.inactive')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fef2f2' }]} onPress={() => onDelete(store)}>
            <Trash2 size={ms(14)} color="#dc2626" strokeWidth={1.5} />
            <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>{t('stores.deleteBtn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// â”€â”€ Form reducer â”€â”€
type StepIndex = 0 | 1 | 2 | 3;
const TOTAL_STEPS = 4;

interface FormState {
  step: StepIndex;
  nom: string;
  description: string;
  categorie: MerchantCategory | '';
  ville: string;
  quartier: string;
  adresse: string;
  telephone: string;
  email: string;
  instagram: string;
  tiktok: string;
  website: string;
  latitude: number | null;
  longitude: number | null;
  addressSearch: string;
  locating: boolean;
  showCategoryPicker: boolean;
}

const INITIAL_FORM: FormState = {
  step: 0,
  nom: '',
  description: '',
  categorie: '',
  ville: '',
  quartier: '',
  adresse: '',
  telephone: '',
  email: '',
  instagram: '',
  tiktok: '',
  website: '',
  latitude: null,
  longitude: null,
  addressSearch: '',
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
        step: 0,
        nom: s.nom,
        description: s.description ?? '',
        categorie: s.categorie ?? '',
        ville: s.ville ?? '',
        quartier: s.quartier ?? '',
        adresse: s.adresse ?? '',
        telephone: s.telephone ?? '',
        email: s.email ?? '',
        instagram: s.socialLinks?.instagram ?? '',
        tiktok: s.socialLinks?.tiktok ?? '',
        website: s.socialLinks?.website ?? '',
        latitude: s.latitude ?? null,
        longitude: s.longitude ?? null,
        addressSearch: s.adresse ?? '',
        showCategoryPicker: false,
      };
    }
  }
}

export default function StoresScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { merchant, isTeamMember } = useAuth();

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
    alertMaxStores, saveStore, deleteStore, toggleActive,
  } = useStoresCRUD();

  const { t } = useLanguage();

  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreType | null>(null);

  // ── Reference store = oldest store (first in list, sorted by createdAt asc) ──
  const referenceStore = useMemo(() => stores.length > 0 ? stores[0] : null, [stores]);
  const isEditingReferenceStore = useMemo(() => {
    if (!editingStore) return true; // creating = treat as reference if it's the first
    return referenceStore?.id === editingStore.id;
  }, [editingStore, referenceStore]);
  // For branches: is this a non-reference store being created (stores already exist)?
  const isBranch = useMemo(() => {
    if (editingStore) return !isEditingReferenceStore;
    return stores.length > 0; // creating when stores exist = branch
  }, [editingStore, isEditingReferenceStore, stores.length]);

  // Form state (reducer)
  const [form, formDispatch] = useReducer(formReducer, INITIAL_FORM);
  const { step, nom, description, categorie, ville, quartier, adresse, telephone, email, instagram, tiktok, website, latitude, longitude, addressSearch, locating, showCategoryPicker } = form;
  const setForm = useCallback((payload: Partial<FormState>) => formDispatch({ type: 'SET', payload }), []);

  // Step navigation helpers
  const canGoNext = useMemo(() => {
    if (step === 0) return nom.trim().length > 0;
    if (step === 1) return true; // contact is optional
    if (step === 2) return true; // social is optional
    return true;
  }, [step, nom]);

  const goNext = useCallback(() => {
    if (step < 3) setForm({ step: (step + 1) as StepIndex });
  }, [step, setForm]);

  const goBack = useCallback(() => {
    if (step > 0) setForm({ step: (step - 1) as StepIndex });
  }, [step, setForm]);

  const mapRef = useRef<SafeMapViewRef>(null);
  const overviewMapRef = useRef<SafeMapViewRef>(null);

  // User's live GPS position (fetched once, used as default map center)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch { /* silently ignore */ }
    })();
  }, []);

  // Auto-locate when entering step 2 with no coordinates yet
  useEffect(() => {
    if (step === 3 && latitude === null && longitude === null) {
      handleUseMyLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Default map center: store coords > user GPS > Casablanca fallback
  const defaultCenter = useMemo(() => ({
    latitude: latitude ?? userLocation?.latitude ?? 33.5731,
    longitude: longitude ?? userLocation?.longitude ?? -7.5898,
  }), [latitude, longitude, userLocation]);
  // â”€â”€ Stores with coordinates for overview map â”€â”€
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

  // â”€â”€ Fit map to all stores when they change â”€â”€
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

  // â”€â”€ Reset form â”€â”€
  const resetForm = () => {
    formDispatch({ type: 'RESET', defaults: { categorie: merchant?.categorie ?? '', ville: merchant?.ville ?? '' } });
    setEditingStore(null);
  };

  // â”€â”€ Open modal â”€â”€
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

  // â”€â”€ Save â”€â”€
  const handleSave = async () => {
    const socialLinks = isBranch ? undefined : {
      instagram: instagram.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '') || undefined,
      tiktok: tiktok.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '') || undefined,
      website: website.trim() || undefined,
    };
    const hasSocial = socialLinks ? Object.values(socialLinks).some(Boolean) : false;

    const payload: Partial<CreateStorePayload> & { nom: string } = {
      nom: nom.trim(),
      ...(!isBranch && { description: description.trim() || undefined }),
      ville: ville.trim() || undefined,
      quartier: quartier.trim() || undefined,
      adresse: adresse.trim() || undefined,
      telephone: telephone.trim() || undefined,
      ...(!isBranch && { email: email.trim() || undefined }),
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      categorie: categorie || undefined,
      ...(!isBranch && { socialLinks: hasSocial ? socialLinks : undefined }),
    };
    const ok = await saveStore(payload as CreateStorePayload, editingStore?.id);
    if (ok) setShowModal(false);
  };

  // â”€â”€ Delete â”€â”€
  const handleDelete = (store: StoreType) => deleteStore(store);

  // â”€â”€ Geocoding helpers â”€â”€
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
      if (status !== 'granted') {
        Alert.alert(t('stores.permissionDenied'), t('stores.enableLocation'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setUserLocation({ latitude: lat, longitude: lng });
      setForm({ latitude: lat, longitude: lng });
      mapRef.current?.animateToRegion({
        latitude: lat, longitude: lng,
        latitudeDelta: FIVE_KM_DELTA, longitudeDelta: FIVE_KM_DELTA,
      });
      await reverseGeocodeAndLabel(lat, lng);
    } catch {
      Alert.alert(t('common.error'), t('stores.locationError'));
    } finally {
      setForm({ locating: false });
    }
  };

  // â”€â”€ Category helper â”€â”€
  const getCategoryLabel = (cat?: MerchantCategory | '') => {
    if (!cat) return t('stores.sameCategoryLabel');
    return getCategoryLabelFn(cat);
  };

  // ── Main view ──
  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 16, marginTop: 16, fontFamily: 'Lexend_600SemiBold' }}>{t('common.ownerOnly')}</Text>
        <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 8, fontFamily: 'Lexend_400Regular' }}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View collapsable={false}>
        <LinearGradient
          colors={[...brandGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 20}
            tint={theme.mode === 'dark' ? 'dark' : 'default'}
            style={[styles.headerBlur, { paddingTop: insets.top + 16 }]}
          >
            <View style={styles.glassOverlay} />
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <ArrowLeft size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{t('stores.title')}</Text>
              <View style={{ width: 24 }} />
            </View>
          </BlurView>
        </LinearGradient>
        <LinearGradient
          colors={['rgba(124,58,237,0.3)', 'transparent']}
          style={styles.headerFade}
        />
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

      {/* â”€â”€ Overview Map â”€â”€ */}
      {!loading && storesWithCoords.length > 0 && (
        <View style={styles.overviewMapWrapper}>
          <MapView
            ref={overviewMapRef}
            style={styles.overviewMap}
            region={overviewRegion}
            customMapStyle={MAP_STYLE}
            showsPointsOfInterest={false}
            showsBuildings={false}
            showsIndoors={false}
            showsTraffic={false}
            scrollEnabled={true}
            zoomEnabled={true}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            {storesWithCoords.map((store) => (
              <TrackedStoreMarker
                key={store.id}
                store={store}
                logoUrl={merchant?.logoUrl}
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
          {/* â”€â”€ Guide text â”€â”€ */}
          <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary, marginBottom: 12 }]}>
            <Text style={[styles.guideText, { color: theme.textSecondary }]}>
              {t('stores.guideText')}
            </Text>
          </View>

          {stores.map((store, index) => (
            <StoreCard
              key={store.id}
              store={store}
              merchantCategorie={merchant?.categorie}
              isReference={index === 0}
              onEdit={openEdit}
              onToggle={toggleActive}
              onDelete={handleDelete}
            />
          ))}
        </ScrollView>
      )}

      {/* â”€â”€ Create / Edit Modal â”€â”€ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} style={{ flex: 1 }}>
          <View style={[styles.modalOverlay]}>
            <View style={[styles.modalContent, { backgroundColor: theme.bg, paddingTop: Math.max(insets.top, 16) }]}>
              {/* Modal header with step indicator */}
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => { if (step > 0) goBack(); else setShowModal(false); }}>
                  {step > 0 ? <ArrowLeft size={ms(22)} color={theme.text} /> : <X size={ms(22)} color={theme.text} />}
                </TouchableOpacity>
                <View style={styles.stepHeaderCenter}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {editingStore ? t('stores.editStore') : t('stores.addStore')}
                  </Text>
                  <Text style={[styles.stepLabel, { color: theme.textMuted }]}>
                    {t('stores.stepOf', { current: step + 1, total: TOTAL_STEPS })}
                  </Text>
                </View>
                <View style={{ width: ms(22) }} />
              </View>

              {/* Progress bar */}
              <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
              </View>

              {/* Step title + description */}
              <View style={styles.stepTitleRow}>
                <View style={[styles.stepIconCircle, { backgroundColor: palette.violet + '14' }]}>
                  {step === 0 && <Tag size={ms(18)} color={palette.violet} strokeWidth={1.5} />}
                  {step === 1 && <Contact size={ms(18)} color={palette.violet} strokeWidth={1.5} />}
                  {step === 2 && <Instagram size={ms(18)} color={palette.violet} strokeWidth={1.5} />}
                  {step === 3 && <MapPin size={ms(18)} color={palette.violet} strokeWidth={1.5} />}
                </View>
                <View style={{ flex: 1, marginLeft: wp(12) }}>
                  <Text style={[styles.stepTitleText, { color: theme.text }]}>
                    {step === 0 ? t('stores.sectionInfo') : step === 1 ? t('stores.sectionContact') : step === 2 ? t('stores.sectionSocial') : t('stores.sectionLocation')}
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    {step === 0 ? t('stores.stepInfoDesc') : step === 1 ? t('stores.stepContactDesc') : step === 2 ? t('stores.stepSocialDesc') : t('stores.stepLocationDesc')}
                  </Text>
                </View>
              </View>

              <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Step 1: Informations */}
                {step === 0 && (
                  <>
                    <Text style={[styles.label, { color: theme.text }]}>{t('stores.nameLabel')} *</Text>
                    <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: nom.trim() ? theme.success : theme.border }]}>
                      <Store size={ms(18)} color={nom.trim() ? theme.success : theme.textMuted} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        value={nom}
                        onChangeText={(v) => setForm({ nom: v })}
                        placeholder={t('stores.namePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        autoFocus={!editingStore}
                      />
                      {nom.trim().length > 0 && <Check size={ms(16)} color={theme.success} strokeWidth={2.5} />}
                    </View>

                    <Text style={[styles.label, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
                    <TouchableOpacity
                      style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: categorie ? palette.violet : theme.border }]}
                      onPress={() => setForm({ showCategoryPicker: true })}
                    >
                      <MerchantCategoryIcon category={categorie || merchant?.categorie || MerchantCategory.AUTRE} size={ms(22)} />
                      <Text style={[styles.input, { color: categorie ? theme.text : theme.textMuted, flex: 1 }]}>
                        {getCategoryLabel(categorie)}
                      </Text>
                      <ChevronDown size={ms(16)} color={theme.textMuted} />
                    </TouchableOpacity>

                    {isBranch ? (
                      <>
                        {referenceStore?.description ? (
                          <>
                            <Text style={[styles.label, { color: theme.textMuted }]}>{t('stores.descLabel')}</Text>
                            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, minHeight: ms(90), alignItems: 'flex-start', opacity: 0.6 }]}>
                              <FileText size={ms(16)} color={theme.textMuted} style={{ marginTop: ms(14) }} />
                              <Text style={[styles.input, { color: theme.textMuted, minHeight: ms(70) }]}>
                                {referenceStore.description}
                              </Text>
                              <Lock size={ms(14)} color={theme.textMuted} style={{ marginTop: ms(14) }} />
                            </View>
                          </>
                        ) : null}
                        <View style={[styles.branchHintBadge, { backgroundColor: palette.violet + '08', borderColor: palette.violet + '20' }]}>
                          <Lock size={ms(14)} color={palette.violet} />
                          <Text style={[styles.branchHintText, { color: palette.violet }]}>
                            {t('stores.branchDescHint')}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.label, { color: theme.text }]}>{t('stores.descLabel')}</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, minHeight: ms(90), alignItems: 'flex-start' }]}>
                          <FileText size={ms(16)} color={theme.textMuted} style={{ marginTop: ms(14) }} />
                          <TextInput
                            style={[styles.input, { color: theme.text, textAlignVertical: 'top', minHeight: ms(70) }]}
                            value={description}
                            onChangeText={(v) => setForm({ description: v })}
                            placeholder={t('stores.descPlaceholder')}
                            placeholderTextColor={theme.textMuted}
                            multiline
                            maxLength={1000}
                          />
                        </View>
                        <Text style={{ fontSize: ms(11), color: theme.textMuted, textAlign: 'right', marginTop: ms(4) }}>
                          {description.length}/1000
                        </Text>
                      </>
                    )}
                  </>
                )}

                {/* Step 2: Contact */}
                {step === 1 && (
                  <>
                    <Text style={[styles.label, { color: theme.text }]}>{t('stores.phoneLabel')}</Text>
                    <PhoneInput
                      value={telephone}
                      onChangeText={(v) => setForm({ telephone: v })}
                      placeholder={t('stores.phonePlaceholder')}
                    />

                    {isBranch ? (
                      <>
                        {referenceStore?.email ? (
                          <>
                            <Text style={[styles.label, { color: theme.textMuted }]}>{t('stores.emailLabel')}</Text>
                            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, opacity: 0.6 }]}>
                              <Mail size={ms(18)} color={theme.textMuted} />
                              <Text style={[styles.input, { color: theme.textMuted }]} numberOfLines={1}>
                                {referenceStore.email}
                              </Text>
                              <Lock size={ms(14)} color={theme.textMuted} />
                            </View>
                          </>
                        ) : null}
                        <View style={[styles.branchHintBadge, { backgroundColor: palette.violet + '08', borderColor: palette.violet + '20' }]}>
                          <Lock size={ms(14)} color={palette.violet} />
                          <Text style={[styles.branchHintText, { color: palette.violet }]}>
                            {t('stores.branchEmailHint')}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.label, { color: theme.text }]}>{t('stores.emailLabel')}</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: email && isValidEmail(email) ? theme.success : email.length > 3 && !isValidEmail(email) ? theme.danger : theme.border }]}>
                          <Mail size={ms(18)} color={email && isValidEmail(email) ? theme.success : theme.textMuted} />
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
                          {email && isValidEmail(email) && <Check size={ms(16)} color={theme.success} strokeWidth={2.5} />}
                        </View>
                        {email.length > 3 && !isValidEmail(email) && (
                          <Text style={[styles.validationHint, { color: theme.danger }]}>{t('stores.invalidEmail')}</Text>
                        )}
                      </>
                    )}

                    <View style={[styles.stepOptionalBadge, { backgroundColor: palette.violet + '10' }]}>
                      <Text style={[styles.stepOptionalText, { color: palette.violet }]}>{t('stores.contactOptional')}</Text>
                    </View>
                  </>
                )}

                {/* Step 3: Réseaux sociaux */}
                {step === 2 && (
                  <>
                    {isBranch ? (
                      <>
                        {/* Read-only inherited social fields */}
                        {referenceStore?.socialLinks?.instagram ? (
                          <View style={styles.fieldGroup}>
                            <Text style={[styles.label, { color: theme.textMuted }]}>Instagram</Text>
                            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, opacity: 0.6 }]}>
                              <Instagram size={ms(18)} color="#E1306C" />
                              <Text style={[styles.input, { color: theme.textMuted }]} numberOfLines={1}>
                                @{referenceStore.socialLinks.instagram}
                              </Text>
                              <Lock size={ms(14)} color={theme.textMuted} />
                            </View>
                          </View>
                        ) : null}
                        {referenceStore?.socialLinks?.tiktok ? (
                          <View style={styles.fieldGroup}>
                            <Text style={[styles.label, { color: theme.textMuted }]}>TikTok</Text>
                            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, opacity: 0.6 }]}>
                              <Globe size={ms(18)} color={theme.textMuted} />
                              <Text style={[styles.input, { color: theme.textMuted }]} numberOfLines={1}>
                                @{referenceStore.socialLinks.tiktok}
                              </Text>
                              <Lock size={ms(14)} color={theme.textMuted} />
                            </View>
                          </View>
                        ) : null}
                        {referenceStore?.socialLinks?.website ? (
                          <View style={styles.fieldGroup}>
                            <Text style={[styles.label, { color: theme.textMuted }]}>{t('stores.websiteLabel')}</Text>
                            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, opacity: 0.6 }]}>
                              <Globe size={ms(18)} color={theme.textMuted} />
                              <Text style={[styles.input, { color: theme.textMuted }]} numberOfLines={1}>
                                {referenceStore.socialLinks.website}
                              </Text>
                              <Lock size={ms(14)} color={theme.textMuted} />
                            </View>
                          </View>
                        ) : null}
                        <View style={[styles.branchHintBadge, { backgroundColor: palette.violet + '08', borderColor: palette.violet + '20' }]}>
                          <Lock size={ms(14)} color={palette.violet} />
                          <Text style={[styles.branchHintText, { color: palette.violet }]}>
                            {t('stores.branchSocialHint')}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.fieldGroup}>
                          <Text style={[styles.label, { color: theme.text }]}>Instagram</Text>
                          <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: instagram.trim() ? theme.success : theme.border }]}>
                            <Instagram size={ms(18)} color="#E1306C" />
                            <TextInput
                              style={[styles.input, { color: theme.text }]}
                              value={instagram}
                              onChangeText={(v) => setForm({ instagram: v })}
                              placeholder="@nom_utilisateur"
                              placeholderTextColor={theme.textMuted}
                              autoCapitalize="none"
                              autoCorrect={false}
                            />
                          </View>
                        </View>

                        <View style={styles.fieldGroup}>
                          <Text style={[styles.label, { color: theme.text }]}>TikTok</Text>
                          <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: tiktok.trim() ? theme.success : theme.border }]}>
                            <Globe size={ms(18)} color={theme.textMuted} />
                            <TextInput
                              style={[styles.input, { color: theme.text }]}
                              value={tiktok}
                              onChangeText={(v) => setForm({ tiktok: v })}
                              placeholder="@nom_utilisateur"
                              placeholderTextColor={theme.textMuted}
                              autoCapitalize="none"
                              autoCorrect={false}
                            />
                          </View>
                        </View>

                        <View style={styles.fieldGroup}>
                          <Text style={[styles.label, { color: theme.text }]}>{t('stores.websiteLabel')}</Text>
                          <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: website.trim() ? theme.success : theme.border }]}>
                            <Globe size={ms(18)} color={website.trim() ? palette.violet : theme.textMuted} />
                            <TextInput
                              style={[styles.input, { color: theme.text }]}
                              value={website}
                              onChangeText={(v) => setForm({ website: v })}
                              placeholder="https://www.example.com"
                              placeholderTextColor={theme.textMuted}
                              autoCapitalize="none"
                              autoCorrect={false}
                              keyboardType="url"
                            />
                          </View>
                        </View>
                      </>
                    )}

                    <View style={[styles.stepOptionalBadge, { backgroundColor: palette.violet + '10' }]}>
                      <Text style={[styles.stepOptionalText, { color: palette.violet }]}>{t('stores.socialOptional')}</Text>
                    </View>
                  </>
                )}

                {/* Step 4: Localisation */}
                {step === 3 && (
                  <>
                    <TouchableOpacity
                      style={[styles.locateMeCard, { backgroundColor: palette.violet + '08', borderColor: palette.violet + '20' }]}
                      onPress={handleUseMyLocation}
                      disabled={locating}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.locateMeIcon, { backgroundColor: palette.violet }]}>
                        {locating ? <ActivityIndicator size="small" color="#fff" /> : <Navigation size={ms(18)} color="#fff" strokeWidth={1.5} />}
                      </View>
                      <View style={{ flex: 1, marginLeft: wp(12) }}>
                        <Text style={[styles.locateMeTitle, { color: theme.text }]}>{t('stores.locateMe')}</Text>
                        <Text style={[styles.locateMeHint, { color: theme.textMuted }]}>{t('stores.locateMeHint')}</Text>
                      </View>
                    </TouchableOpacity>

                    <Text style={[styles.label, { color: theme.text }]}>{t('stores.searchAddress')}</Text>
                    <View style={{ zIndex: 1000, elevation: 10 }}>
                      <AddressAutocomplete
                        value={addressSearch}
                        onChangeText={(text) => { setForm({ addressSearch: text, adresse: text }); }}
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

                    <Text style={[styles.mapHintText, { color: theme.textMuted }]}>{t('stores.mapHint')}</Text>

                    {latitude !== null && longitude !== null && (
                      <View style={[styles.gpsIndicator, { backgroundColor: `${theme.success}12` }]}>
                        <Check size={ms(14)} color={theme.success} strokeWidth={2.5} />
                        <Text style={[styles.gpsIndicatorText, { color: theme.success }]}>
                          {adresse || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
                        </Text>
                      </View>
                    )}

                    <Text style={[styles.label, { color: theme.text }]}>{t('stores.addressLabel')}</Text>
                    <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: adresse.trim() ? theme.success : theme.border }]}>
                      <MapPin size={ms(18)} color={adresse.trim() ? theme.success : theme.textMuted} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        value={adresse}
                        onChangeText={(text) => setForm({ adresse: text })}
                        placeholder={t('stores.addressAutoPlaceholder')}
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                  </>
                )}

                <View style={{ height: ms(100) }} />
              </ScrollView>

              {/* Bottom action bar */}
              <View style={[styles.bottomBar, { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, ms(16)) }]}>
                {step === 3 ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: saving ? palette.violet + '80' : palette.violet }]}
                    onPress={handleSave}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Check size={ms(18)} color="#fff" strokeWidth={2} />
                        <Text style={styles.primaryBtnText}>{editingStore ? t('stores.saveBtn') : t('stores.addStore')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: canGoNext ? palette.violet : palette.violet + '40' }]}
                    onPress={goNext}
                    disabled={!canGoNext}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryBtnText}>{t('stores.nextStep')}</Text>
                    <ArrowLeft size={ms(16)} color="#fff" strokeWidth={2} style={{ transform: [{ rotate: '180deg' }] }} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* â”€â”€ Category Picker Modal â”€â”€ */}
      <Modal visible={showCategoryPicker} animationType="fade" transparent>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setForm({ showCategoryPicker: false })}>
          <View style={[styles.pickerCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
            <ScrollView style={{ maxHeight: 350 }}>
              {getCategoryOptions().map((opt) => {
                const emoji = CATEGORY_EMOJIS[opt.value] ?? 'ðŸ·ï¸';
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

  // Header — glassmorphism
  headerGradient: { overflow: 'hidden' },
  headerBlur: { overflow: 'hidden' },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  headerFade: { height: 4 },
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
  counterText: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  addBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addBtnSmallText: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, fontFamily: 'Lexend_700Bold' },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22, fontFamily: 'Lexend_400Regular' },
  addBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 20,
  },
  addBtnLargeText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  guideContainer: {
    marginHorizontal: 0,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  listContent: { padding: wp(16), gap: ms(14), paddingBottom: 32 },

  // Card — callout style matching discover screen
  card: {
    borderRadius: ms(22),
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.08)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: hp(3) }, shadowOpacity: 0.10, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ms(4),
    borderTopLeftRadius: ms(22),
    borderBottomLeftRadius: ms(22),
  },
  cardBody: {
    paddingVertical: wp(14),
    paddingLeft: wp(18),
    paddingRight: wp(14),
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAvatar: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: wp(12),
  },
  cardName: { fontSize: FS.lg, fontWeight: '700', letterSpacing: -0.3, fontFamily: 'Lexend_700Bold' },
  cardCatBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: ms(8),
    paddingVertical: ms(2),
    borderRadius: ms(8),
    marginTop: ms(4),
  },
  cardCatText: { fontSize: ms(11), fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  statusBadge: { paddingHorizontal: ms(8), paddingVertical: ms(3), borderRadius: ms(8) },
  cardDetail: { flexDirection: 'row', alignItems: 'center', gap: ms(6), marginTop: ms(6) },
  cardDetailText: { fontSize: ms(12), flex: 1, fontFamily: 'Lexend_400Regular' },
  cardActions: { flexDirection: 'row', gap: ms(8), marginTop: ms(14) },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: ms(8),
    borderRadius: ms(12),
    gap: ms(4),
  },
  actionBtnText: { fontSize: ms(11), fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

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
  modalTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  formContent: { paddingHorizontal: 20, paddingTop: 16 },

  // Form
  label: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0, fontFamily: 'Lexend_500Medium' },
  validationHint: { fontSize: 11, marginTop: 4, marginLeft: 4, fontFamily: 'Lexend_400Regular' },
  fieldGroup: { marginBottom: ms(12) },

  // Overview Map — premium style
  overviewMapWrapper: {
    marginHorizontal: wp(16),
    marginTop: ms(12),
    borderRadius: ms(22),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.08)',
    height: hp(200),
    ...Platform.select({
      ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: hp(3) }, shadowOpacity: 0.10, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  overviewMap: { width: '100%', height: '100%' },

  // Map
  mapWrapper: { borderRadius: 14, overflow: 'hidden', marginTop: 8, borderWidth: 1, height: 260 },
  map: { width: '100%', height: '100%' },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  gpsIndicatorText: { fontSize: 12, fontWeight: '500', flex: 1, fontFamily: 'Lexend_500Medium' },

  // Category picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  pickerCard: { borderRadius: 16, padding: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'center', fontFamily: 'Lexend_700Bold' },
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
  pickerOptionText: { flex: 1, fontSize: 14, fontWeight: '500', fontFamily: 'Lexend_500Medium' },

  // Wizard stepper
  progressTrack: {
    height: ms(3),
    borderRadius: ms(2),
    marginHorizontal: wp(20),
  },
  progressFill: {
    height: '100%',
    borderRadius: ms(2),
    backgroundColor: palette.violet,
  },
  stepHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  stepLabel: {
    fontSize: ms(11),
    fontWeight: '500',
    marginTop: ms(2),
    fontFamily: 'Lexend_500Medium',
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(20),
    paddingVertical: ms(12),
  },
  stepIconCircle: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitleText: {
    fontSize: FS.md,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: 'Lexend_700Bold',
  },
  stepDesc: {
    fontSize: ms(12),
    marginTop: ms(2),
    lineHeight: ms(16),
    fontFamily: 'Lexend_400Regular',
  },

  // Bottom action bar
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: wp(20),
    paddingTop: ms(12),
    borderTopWidth: 1,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: ms(50),
    borderRadius: ms(16),
    gap: ms(8),
    ...Platform.select({
      ios: { shadowColor: palette.violet, shadowOffset: { width: 0, height: hp(4) }, shadowOpacity: 0.25, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: FS.md,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: 'Lexend_700Bold',
  },

  locateMeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: ms(14),
    borderRadius: ms(16),
    borderWidth: 1,
    marginBottom: ms(8),
  },
  locateMeIcon: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateMeTitle: {
    fontSize: FS.sm,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  locateMeHint: {
    fontSize: ms(11),
    marginTop: ms(2),
    fontFamily: 'Lexend_400Regular',
  },
  stepOptionalBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: ms(10),
    marginTop: ms(16),
  },
  stepOptionalText: {
    fontSize: ms(12),
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  branchHintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    padding: ms(12),
    borderRadius: ms(12),
    borderWidth: 1,
    marginTop: ms(14),
  },
  branchHintText: {
    flex: 1,
    fontSize: ms(12),
    fontWeight: '600',
    lineHeight: ms(17),
    fontFamily: 'Lexend_600SemiBold',
  },
  referenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ms(6),
    paddingVertical: ms(2),
    borderRadius: ms(6),
    gap: ms(3),
  },
  referenceBadgeText: {
    fontSize: ms(9),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Lexend_700Bold',
  },
  mapHintText: {
    fontSize: ms(11),
    textAlign: 'center',
    marginTop: ms(6),
    marginBottom: ms(4),
    fontFamily: 'Lexend_400Regular',
  },
});



