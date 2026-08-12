import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  I18nManager,
  Pressable,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Contact,
  Eye,
  Instagram,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Store,
  Tag,
  Trash2,
  Globe,
  Phone,
  Mail,
  Navigation,
  Sparkles,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStoresCRUD, MAX_STORES } from '@/hooks/useStoresCRUD';
import FichePreviewModal from '@/components/FichePreviewModal';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import PhoneInput from '@/components/PhoneInput';
import AddressAutocomplete, { AddressResult } from '@/components/AddressAutocomplete';
import SafeMapView, { Marker, SafeMapViewRef } from '@/components/SafeMapView';
import { reverseGeocodeAsync } from '@/utils/geocodeCache';
import { getCategoryLabel as getCategoryLabelFn, getCategoryOptions } from '@/constants/categories';
import { ms, wp, hp } from '@/utils/responsive';
import type { Store as StoreType, Merchant, MerchantCategory, SocialLinks } from '@/types';
import { resolveImageUrl } from '@/utils/imageUrl';

const ACCORDION_KEYS = ['info', 'contact', 'social', 'location'] as const;
type AccordionKey = (typeof ACCORDION_KEYS)[number];

const defaultHours = () => ({
  mon: { slots: [] },
  tue: { slots: [] },
  wed: { slots: [] },
  thu: { slots: [] },
  fri: { slots: [] },
  sat: { slots: [] },
  sun: { slots: [] },
});

const BASE_SOCIALS = { instagram: '', tiktok: '', website: '' };

const VIOLET_MAP_STYLE = [
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

function normalizeSocial(value: string) {
  return value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '');
}

function normalizeWebsite(value: string) {
  return value.trim();
}

function toStoreSocialLinks(socials: { instagram: string; tiktok: string; website: string }): SocialLinks | null {
  const instagram = normalizeSocial(socials.instagram);
  const tiktok = normalizeSocial(socials.tiktok);
  const website = normalizeWebsite(socials.website);
  if (!instagram && !tiktok && !website) return null;
  return {
    instagram: instagram || undefined,
    tiktok: tiktok || undefined,
    website: website || undefined,
  };
}

function emptyStore(): StoreFormValues {
  return {
    nom: '',
    description: '',
    categorie: '',
    telephone: '',
    email: '',
    instagram: '',
    tiktok: '',
    website: '',
    adresse: '',
    quartier: '',
    ville: '',
    latitude: null,
    longitude: null,
    addressSearch: '',
  };
}

type StoreFormValues = {
  nom: string;
  description: string;
  categorie: MerchantCategory | '';
  telephone: string;
  email: string;
  instagram: string;
  tiktok: string;
  website: string;
  adresse: string;
  quartier: string;
  ville: string;
  latitude: number | null;
  longitude: number | null;
  addressSearch: string;
};

interface Props {
  mode: 'create' | 'edit';
  storeId?: string;
  initialView?: 'edit' | 'preview';
}

function SectionHeader({
  label,
  subtitle,
  icon,
  badge,
  open,
  onPress,
  rtl = false,
}: {
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: string;
  open: boolean;
  onPress: () => void;
  rtl?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.sectionHeader, rtl && styles.sectionHeaderRtl]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionHeaderIcon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <View style={styles.sectionHeaderTitleRow}>
            <Text style={[styles.sectionHeaderTitle]} numberOfLines={1}>{label}</Text>
            {badge ? <Text style={styles.prefilledBadge}>{badge}</Text> : null}
          </View>
          {subtitle ? <Text style={styles.sectionHeaderSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </View>
      <Animated.View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
        <ChevronDown size={18} color={palette.violet} strokeWidth={2} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function StoreFormScreen({ mode, storeId, initialView = 'edit' }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const { merchant, isTeamMember } = useAuth();
  const insets = useSafeAreaInsets();
  const { stores, loading, saving, canCreateStore, alertMaxStores, saveStore } = useStoresCRUD();

  const currentStore = useMemo(() => {
    if (mode !== 'edit') return null;
    if (storeId) return stores.find((s) => s.id === storeId) ?? null;
    return stores[0] ?? null;
  }, [mode, storeId, stores]);

  const referenceStore = useMemo(() => stores[0] ?? null, [stores]);
  const hasExistingStores = stores.length > 0;
  const isCreateMode = mode === 'create';
  const isEditMode = mode === 'edit';
  const isReferenceStore = !!currentStore && referenceStore?.id === currentStore.id;

  const initialValues = useMemo<StoreFormValues>(() => {
    if (isEditMode && currentStore) {
      return {
        nom: currentStore.nom ?? '',
        description: currentStore.description ?? '',
        categorie: currentStore.categorie ?? '',
        telephone: currentStore.telephone ?? '',
        email: currentStore.email ?? '',
        instagram: currentStore.socialLinks?.instagram ?? '',
        tiktok: currentStore.socialLinks?.tiktok ?? '',
        website: currentStore.socialLinks?.website ?? '',
        adresse: currentStore.adresse ?? '',
        quartier: currentStore.quartier ?? '',
        ville: currentStore.ville ?? '',
        latitude: currentStore.latitude ?? null,
        longitude: currentStore.longitude ?? null,
        addressSearch: currentStore.adresse ?? '',
      };
    }
    const prefillCategory = referenceStore?.categorie ?? merchant?.categorie ?? '';
    const prefillSocials = referenceStore?.socialLinks ?? null;
    return {
      ...emptyStore(),
      categorie: prefillCategory,
      instagram: prefillSocials?.instagram ?? '',
      tiktok: prefillSocials?.tiktok ?? '',
      website: prefillSocials?.website ?? '',
    };
  }, [currentStore, isEditMode, merchant?.categorie, referenceStore]);

  const [form, setForm] = useState<StoreFormValues>(initialValues);
  const [openSection, setOpenSection] = useState<AccordionKey>('info');
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>(initialView);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [locating, setLocating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef<TextInput>(null);
  const mapRef = useRef<SafeMapViewRef>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 1700);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    setForm(initialValues);
    setPreviewMode(initialView);
    setOpenSection('info');
  }, [initialValues, initialView]);

  useEffect(() => {
    if (isCreateMode && referenceStore) {
      setForm((prev) => ({
        ...prev,
        categorie: prev.categorie || referenceStore.categorie || '',
        instagram: prev.instagram || referenceStore.socialLinks?.instagram || '',
        tiktok: prev.tiktok || referenceStore.socialLinks?.tiktok || '',
        website: prev.website || referenceStore.socialLinks?.website || '',
      }));
    }
  }, [isCreateMode, referenceStore]);

  useEffect(() => {
    if (isCreateMode) {
      setTimeout(() => nameRef.current?.focus(), 250);
    }
  }, [isCreateMode]);

  const handleBack = useCallback(() => {
    router.replace('/stores');
  }, [router]);

  const handleCategoryPick = useCallback((categorie: MerchantCategory) => {
    setForm((prev) => ({ ...prev, categorie }));
    setShowCategoryPicker(false);
  }, []);

  const setSection = useCallback((key: AccordionKey) => {
    setOpenSection((prev) => (prev === key ? prev : key));
  }, []);

  const isValidWebsite = useCallback((v: string): boolean => {
    const trimmed = v.trim();
    if (!trimmed) return true;
    return /^https?:\/\/[^\s]+$/i.test(trimmed);
  }, []);

  const handleSelectAddress = useCallback((result: AddressResult) => {
    setForm((prev) => ({
      ...prev,
      addressSearch: result.address,
      adresse: result.formattedAddress || result.address,
      ville: result.city || prev.ville,
      quartier: result.district || prev.quartier,
      latitude: result.latitude,
      longitude: result.longitude,
    }));
  }, []);

  const reverseGeocodeAndLabel = useCallback(async (latitude: number, longitude: number) => {
    try {
      const results = await reverseGeocodeAsync({ latitude, longitude });
      if (results.length > 0) {
        const g = results[0];
        const parts = [g.street, g.name, g.district, g.subregion].filter(Boolean);
        setForm((prev) => ({
          ...prev,
          addressSearch: parts.join(', '),
          adresse: parts.join(', ') || prev.adresse,
          ville: g.city || prev.ville,
          quartier: g.district || prev.quartier,
        }));
      }
    } catch {
      // ignore reverse geocode failures
    }
  }, []);

  const handleUseMyLocation = useCallback(async () => {
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        t('stores.locationDisclosureTitle'),
        t('stores.locationDisclosureBody'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('stores.locationDisclosureAllow'), onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!proceed) return;

    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('stores.permissionDenied'), t('stores.enableLocation'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      userLocationRef.current = { latitude, longitude };
      setForm((prev) => ({ ...prev, latitude, longitude }));
      mapRef.current?.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: 0.045,
        longitudeDelta: 0.045,
      });
      await reverseGeocodeAndLabel(latitude, longitude);
    } catch {
      Alert.alert(t('common.error'), t('stores.locationError'));
    } finally {
      setLocating(false);
    }
  }, [reverseGeocodeAndLabel, t]);

  const defaultRegion = useMemo(() => ({
    latitude: form.latitude ?? userLocationRef.current?.latitude ?? 33.5731,
    longitude: form.longitude ?? userLocationRef.current?.longitude ?? -7.5898,
    latitudeDelta: 0.045,
    longitudeDelta: 0.045,
  }), [form.latitude, form.longitude]);

  const isDirty = useMemo(() => {
    const a = initialValues;
    return (
      form.nom.trim() !== a.nom.trim()
      || form.description.trim() !== a.description.trim()
      || (form.categorie || '') !== (a.categorie || '')
      || form.telephone.trim() !== a.telephone.trim()
      || form.email.trim() !== a.email.trim()
      || form.instagram.trim() !== a.instagram.trim()
      || form.tiktok.trim() !== a.tiktok.trim()
      || form.website.trim() !== a.website.trim()
      || form.adresse.trim() !== a.adresse.trim()
      || form.quartier.trim() !== a.quartier.trim()
      || form.ville.trim() !== a.ville.trim()
      || (form.latitude ?? null) !== (a.latitude ?? null)
      || (form.longitude ?? null) !== (a.longitude ?? null)
    );
  }, [form, initialValues]);

  const hasUsableName = form.nom.trim().length >= 2;
  const canSave = isDirty && hasUsableName && !saving;
  const saveLabel = isEditMode ? t('stores.saveChanges') : t('stores.createStore');

  const currentCategory = (form.categorie || merchant?.categorie || referenceStore?.categorie || 'AUTRE') as MerchantCategory;
  const previewMerchant: Merchant = useMemo(() => {
    const socialLinks = toStoreSocialLinks({ instagram: form.instagram, tiktok: form.tiktok, website: form.website });
    const previewStore: StoreType = {
      id: currentStore?.id ?? 'preview-store',
      merchantId: merchant?.id ?? 'preview-merchant',
      nom: form.nom.trim() || currentStore?.nom || merchant?.nom || t('stores.newStore'),
      description: form.description.trim() || currentStore?.description || undefined,
      categorie: currentCategory,
      ville: form.ville.trim() || undefined,
      quartier: form.quartier.trim() || undefined,
      adresse: form.adresse.trim() || undefined,
      latitude: form.latitude ?? undefined,
      longitude: form.longitude ?? undefined,
      telephone: form.telephone.trim() || undefined,
      email: form.email.trim() || undefined,
      logoUrl: currentStore?.logoUrl ?? merchant?.logoUrl,
      coverUrl: currentStore?.coverUrl ?? merchant?.coverUrl,
      socialLinks,
      isActive: currentStore?.isActive ?? true,
    };

    return {
      ...merchant!,
      nom: previewStore.nom,
      categorie: previewStore.categorie ?? merchant!.categorie,
      description: form.description.trim() || merchant?.description,
      email: form.email.trim() || merchant?.email || '',
      ville: form.ville.trim() || merchant?.ville,
      quartier: form.quartier.trim() || merchant?.quartier,
      adresse: form.adresse.trim() || merchant?.adresse,
      latitude: form.latitude ?? merchant?.latitude,
      longitude: form.longitude ?? merchant?.longitude,
      logoUrl: previewStore.logoUrl,
      coverUrl: previewStore.coverUrl,
      socialLinks: socialLinks ?? merchant?.socialLinks ?? null,
      stores: [previewStore],
    } as Merchant;
  }, [currentStore, currentCategory, form, merchant, t]);

  const previewDraft = useMemo(() => ({
    accent: palette.violet,
    iconSlug: null,
    tagline: form.description.trim(),
    badges: [],
    hours: defaultHours(),
    gallery: currentStore?.coverUrl ? [resolveImageUrl(currentStore.coverUrl)] : [],
    secondary: [],
  }), [currentStore?.coverUrl, form.description]);

  const handleSave = useCallback(async () => {
    if (!hasUsableName) {
      Alert.alert(t('common.error'), t('stores.nameRequired'));
      return;
    }
    if (form.website.trim().length > 0 && !isValidWebsite(form.website)) {
      Alert.alert(t('common.error'), t('stores.invalidWebsite'));
      return;
    }
    if (isCreateMode && !canCreateStore) {
      alertMaxStores();
      return;
    }

    const payload = {
      nom: form.nom.trim(),
      description: form.description.trim() || undefined,
      categorie: form.categorie || undefined,
      telephone: form.telephone.trim() || undefined,
      email: form.email.trim() || undefined,
      ville: form.ville.trim() || undefined,
      quartier: form.quartier.trim() || undefined,
      adresse: form.adresse.trim() || undefined,
      latitude: form.latitude ?? undefined,
      longitude: form.longitude ?? undefined,
      socialLinks: toStoreSocialLinks({ instagram: form.instagram, tiktok: form.tiktok, website: form.website }),
    };

    const ok = await saveStore(payload as any, currentStore?.id);
    if (!ok) return;
    router.replace({ pathname: '/stores', params: { toast: isCreateMode ? 'created' : 'saved' } });
  }, [alertMaxStores, canCreateStore, currentStore?.id, form, hasUsableName, isCreateMode, isValidWebsite, router, saveStore, t]);

  const referenceBadge = isReferenceStore ? t('stores.referenceLabel') : undefined;
  const prefilledBadge = isCreateMode && referenceStore ? t('stores.prefilledBadge') : undefined;

  if (loading && !merchant) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!merchant) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={handleBack}
          style={styles.backBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {isEditMode ? (currentStore?.nom || t('stores.editStore')) : t('stores.newStore')}
        </Text>
        {isEditMode ? (
          <View style={[styles.modeSwitch, { backgroundColor: theme.bgInput }]}>
            <TouchableOpacity
              onPress={() => setPreviewMode('edit')}
              style={[styles.modeSegment, previewMode === 'edit' && { backgroundColor: theme.bgCard }]}
              accessibilityRole="button"
              accessibilityState={{ selected: previewMode === 'edit' }}
            >
              <Pencil size={13} color={previewMode === 'edit' ? palette.violet : theme.textMuted} strokeWidth={2} />
              <Text style={[styles.modeText, { color: previewMode === 'edit' ? palette.violet : theme.textMuted }]}>{t('storePreview.modeEdit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPreviewMode('preview')}
              style={[styles.modeSegment, previewMode === 'preview' && { backgroundColor: theme.bgCard }]}
              accessibilityRole="button"
              accessibilityState={{ selected: previewMode === 'preview' }}
            >
              <Eye size={13} color={previewMode === 'preview' ? palette.violet : theme.textMuted} strokeWidth={2} />
              <Text style={[styles.modeText, { color: previewMode === 'preview' ? palette.violet : theme.textMuted }]}>{t('storePreview.modePreview')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {toastMessage ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={[styles.toast, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <Check size={14} color={palette.violet} strokeWidth={2.5} />
            <Text style={[styles.toastText, { color: theme.text }]}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}

      {isCreateMode && referenceStore ? (
        <View style={[styles.prefillBanner, { backgroundColor: `${palette.violet}12`, borderColor: `${palette.violet}28` }]}>
          <Sparkles size={14} color={palette.violet} strokeWidth={2} />
          <Text style={[styles.prefillBannerText, { color: palette.violet }]}>
            {t('stores.prefilledSummary', { name: referenceStore.nom })}
          </Text>
        </View>
      ) : null}

      {isEditMode && previewMode === 'preview' ? (
        <FichePreviewModal
          inline
          visible
          onClose={handleBack}
          merchant={previewMerchant}
          draft={previewDraft as any}
          theme={theme as any}
          t={t}
          getCategoryLabel={(c) => getCategoryLabelFn(c as MerchantCategory)}
        />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isEditMode && currentStore ? (
              <View style={[styles.summaryCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                <View style={styles.summaryLeft}>
                  <View style={[styles.summaryLogo, { backgroundColor: theme.bgInput }]}>
                    {currentStore.logoUrl ? (
                      <ExpoImage source={resolveImageUrl(currentStore.logoUrl)} style={styles.summaryLogoImage} contentFit="cover" cachePolicy="disk" />
                    ) : (
                      <Store size={22} color={palette.violet} strokeWidth={1.8} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryTitle, { color: theme.text }]} numberOfLines={1}>{currentStore.nom}</Text>
                    <View style={styles.summaryBadgesRow}>
                      <View style={[styles.summaryBadge, { backgroundColor: currentStore.isActive ? `${palette.violet}14` : `${theme.danger}12` }]}>
                        <Text style={[styles.summaryBadgeText, { color: currentStore.isActive ? palette.violet : theme.danger }]}>
                          {currentStore.isActive ? t('stores.active') : t('stores.inactive')}
                        </Text>
                      </View>
                      {referenceBadge ? (
                        <View style={[styles.summaryBadge, { backgroundColor: `${theme.textMuted}10` }]}>
                          <Text style={[styles.summaryBadgeText, { color: theme.textMuted }]}>{referenceBadge}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            <SectionHeader
              label={t('stores.sectionInfo')}
              subtitle={t('stores.stepInfoDesc')}
              icon={<Tag size={16} color={palette.violet} strokeWidth={2} />}
              open={openSection === 'info'}
              onPress={() => setSection('info')}
              rtl={I18nManager.isRTL}
              badge={isCreateMode && referenceStore ? prefilledBadge : undefined}
            />
            {openSection === 'info' ? (
              <View style={styles.sectionBody}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('stores.nameLabel')} *</Text>
                <View style={[styles.inputShell, { backgroundColor: theme.bgInput, borderColor: hasUsableName ? theme.success : theme.border }]}>
                  <Store size={18} color={hasUsableName ? theme.success : theme.textMuted} />
                  <TextInput
                    ref={nameRef}
                    value={form.nom}
                    onChangeText={(nom) => setForm((prev) => ({ ...prev, nom }))}
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder={t('stores.namePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoFocus={isCreateMode}
                    returnKeyType="next"
                  />
                  {hasUsableName ? <Check size={16} color={theme.success} strokeWidth={2.5} /> : null}
                </View>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('stores.categoryLabel')} {isCreateMode && referenceStore ? <Text style={styles.prefilledInline}>· {t('stores.prefilledBadge')}</Text> : null}</Text>
                <TouchableOpacity
                  onPress={() => setShowCategoryPicker(true)}
                  activeOpacity={0.8}
                  style={[styles.inputShell, { backgroundColor: theme.bgInput, borderColor: form.categorie ? palette.violet : theme.border }]}
                >
                  <MerchantCategoryIcon category={currentCategory} size={22} />
                  <Text style={[styles.textInput, { color: form.categorie ? theme.text : theme.textMuted, flex: 1 }]} numberOfLines={1}>
                    {form.categorie ? getCategoryLabelFn(form.categorie) : t('stores.sameCategoryLabel')}
                  </Text>
                  <ChevronDown size={16} color={theme.textMuted} />
                </TouchableOpacity>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('stores.descLabel')}</Text>
                <View style={[styles.textAreaShell, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Sparkles size={16} color={theme.textMuted} style={{ marginTop: 14 }} />
                  <TextInput
                    value={form.description}
                    onChangeText={(description) => setForm((prev) => ({ ...prev, description }))}
                    style={[styles.textArea, { color: theme.text }]}
                    placeholder={t('stores.descPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    multiline
                    maxLength={1000}
                    textAlignVertical="top"
                  />
                </View>
                <Text style={[styles.counter, { color: theme.textMuted }]}>{form.description.length}/1000</Text>
                <Pressable onPress={() => setShowRules(true)} hitSlop={10} accessibilityRole="button" style={styles.rulesLink}>
                  <Text style={[styles.rulesLinkText, { color: palette.violet }]}>{t('stores.contentRulesLink')}</Text>
                </Pressable>
              </View>
            ) : null}

            <SectionHeader
              label={t('stores.sectionContact')}
              subtitle={t('stores.contactOptional')}
              icon={<Contact size={16} color={palette.violet} strokeWidth={2} />}
              badge={t('stores.optionalBadge')}
              open={openSection === 'contact'}
              onPress={() => setSection('contact')}
              rtl={I18nManager.isRTL}
            />
            {openSection === 'contact' ? (
              <View style={styles.sectionBody}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('stores.phoneLabel')}</Text>
                <PhoneInput
                  value={form.telephone}
                  onChangeText={(telephone) => setForm((prev) => ({ ...prev, telephone }))}
                  style={{ marginBottom: ms(8) }}
                  showValidation={false}
                  placeholder={t('stores.phonePlaceholder')}
                />

                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('stores.emailLabel')}</Text>
                <View style={[styles.inputShell, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Mail size={18} color={theme.textMuted} />
                  <TextInput
                    value={form.email}
                    onChangeText={(email) => setForm((prev) => ({ ...prev, email }))}
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder={t('stores.emailPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            ) : null}

            <SectionHeader
              label={t('stores.sectionSocial')}
              subtitle={t('stores.socialOptional')}
              icon={<Instagram size={16} color={palette.violet} strokeWidth={2} />}
              badge={isCreateMode && referenceStore ? prefilledBadge : undefined}
              open={openSection === 'social'}
              onPress={() => setSection('social')}
              rtl={I18nManager.isRTL}
            />
            {openSection === 'social' ? (
              <View style={styles.sectionBody}>
                {isCreateMode && referenceStore ? (
                  <View style={[styles.prefillMini, { backgroundColor: `${palette.violet}12`, borderColor: `${palette.violet}24` }]}>
                    <Text style={[styles.prefillMiniText, { color: palette.violet }]}>{t('stores.prefilledSummary', { name: referenceStore.nom })}</Text>
                  </View>
                ) : null}

                <Text style={[styles.fieldLabel, { color: theme.text }]}>Instagram</Text>
                <View style={[styles.inputShell, { backgroundColor: theme.bgInput, borderColor: form.instagram.trim() ? theme.success : theme.border }]}>
                  <Instagram size={18} color="#E1306C" />
                  <TextInput
                    value={form.instagram}
                    onChangeText={(instagram) => setForm((prev) => ({ ...prev, instagram }))}
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="@boutique"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>TikTok</Text>
                <View style={[styles.inputShell, { backgroundColor: theme.bgInput, borderColor: form.tiktok.trim() ? theme.success : theme.border }]}>
                  <Pencil size={18} color={theme.textMuted} />
                  <TextInput
                    value={form.tiktok}
                    onChangeText={(tiktok) => setForm((prev) => ({ ...prev, tiktok }))}
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="@boutique"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('stores.websiteLabel')}</Text>
                <View style={[styles.inputShell, { backgroundColor: theme.bgInput, borderColor: form.website.trim() ? (isValidWebsite(form.website) ? theme.success : theme.danger) : theme.border }]}>
                  <Globe size={18} color={form.website.trim() ? palette.violet : theme.textMuted} />
                  <TextInput
                    value={form.website}
                    onChangeText={(website) => setForm((prev) => ({ ...prev, website }))}
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="https://"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
                {form.website.trim().length > 0 && !isValidWebsite(form.website) ? (
                  <Text style={[styles.errorHint, { color: theme.danger }]}>{t('stores.invalidWebsite')}</Text>
                ) : null}
              </View>
            ) : null}

            <SectionHeader
              label={t('stores.sectionLocation')}
              subtitle={t('stores.stepLocationDesc')}
              icon={<MapPin size={16} color={palette.violet} strokeWidth={2} />}
              open={openSection === 'location'}
              onPress={() => setSection('location')}
              rtl={I18nManager.isRTL}
            />
            {openSection === 'location' ? (
              <View style={styles.sectionBody}>
                <TouchableOpacity
                  onPress={handleUseMyLocation}
                  activeOpacity={0.8}
                  style={[styles.primaryGhostBtn, { backgroundColor: `${palette.violet}12`, borderColor: `${palette.violet}28` }]}
                >
                  {locating ? <ActivityIndicator size="small" color={palette.violet} /> : <Navigation size={16} color={palette.violet} strokeWidth={2} />}
                  <Text style={[styles.primaryGhostBtnText, { color: palette.violet }]}>{t('stores.locateMe')}</Text>
                </TouchableOpacity>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('stores.searchAddress')}</Text>
                <AddressAutocomplete
                  value={form.addressSearch}
                  onChangeText={(addressSearch) => setForm((prev) => ({ ...prev, addressSearch }))}
                  onSelect={handleSelectAddress}
                  onNotFound={() => Alert.alert(t('common.error'), t('stores.addressNotFound'))}
                  notFoundMessage={t('stores.addressNotFoundManual')}
                  placeholder={t('stores.addressSearchPlaceholder')}
                  ville={form.ville}
                  userLocation={userLocationRef.current}
                />

                <View style={styles.mapWrapper}>
                  <SafeMapView
                    ref={mapRef}
                    style={styles.map}
                    region={defaultRegion}
                    onPress={(event) => {
                      const { latitude, longitude } = event.nativeEvent.coordinate;
                      setForm((prev) => ({ ...prev, latitude, longitude }));
                      void reverseGeocodeAndLabel(latitude, longitude);
                    }}
                    showsUserLocation={false}
                    zoomEnabled
                    scrollEnabled
                    pitchEnabled={false}
                    rotateEnabled={false}
                    customMapStyle={VIOLET_MAP_STYLE}
                    showsPointsOfInterest={false}
                    showsBuildings={false}
                  >
                    {form.latitude != null && form.longitude != null ? (
                      <Marker
                        draggable
                        coordinate={{ latitude: form.latitude, longitude: form.longitude }}
                        pinColor={palette.violet}
                        onDragEnd={(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                          const { latitude, longitude } = event.nativeEvent.coordinate;
                          setForm((prev) => ({ ...prev, latitude, longitude }));
                          void reverseGeocodeAndLabel(latitude, longitude);
                        }}
                      />
                    ) : null}
                  </SafeMapView>
                </View>
                <Text style={[styles.mapHint, { color: theme.textMuted }]}>{t('stores.mapHint')}</Text>
                {form.latitude != null && form.longitude != null ? (
                  <View style={[styles.gpsIndicator, { backgroundColor: `${palette.violet}12` }]}> 
                    <Check size={14} color={palette.violet} strokeWidth={2.5} />
                    <Text style={[styles.gpsIndicatorText, { color: palette.violet }]}>
                      {form.adresse || `${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.saveBar, { backgroundColor: theme.bgCard, borderTopColor: theme.borderLight, paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave}
              style={[styles.saveButton, !canSave ? { backgroundColor: theme.borderLight } : null]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Save size={18} color={canSave ? '#fff' : theme.textMuted} strokeWidth={2} />
                  <Text style={[styles.saveButtonText, { color: canSave ? '#fff' : theme.textMuted }]}>
                    {saveLabel}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      <View style={styles.absoluteOverlay} pointerEvents="box-none">
        {showCategoryPicker ? (
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.bgCard }]}>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>{t('stores.categoryLabel')}</Text>
              <ScrollView style={{ maxHeight: hp(360) }}>
                {getCategoryOptions().map((option) => {
                  const selected = form.categorie === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => handleCategoryPick(option.value)}
                      style={[styles.categoryRow, selected && { backgroundColor: `${palette.violet}10` }]}
                    >
                      <MerchantCategoryIcon category={option.value} size={20} />
                      <Text style={[styles.categoryRowText, { color: theme.text }]}>{option.label}</Text>
                      {selected ? <Check size={16} color={palette.violet} strokeWidth={2.5} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)} style={[styles.closePickerBtn, { backgroundColor: theme.bgElevated }]}>
                <Text style={{ color: theme.textMuted, fontFamily: 'Lexend_600SemiBold' }}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {showRules ? (
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.bgCard }]}>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>{t('stores.contentRulesTitle')}</Text>
              <Text style={[styles.rulesBody, { color: theme.textSecondary }]}>{t('stores.ugcNotice')}</Text>
              <TouchableOpacity onPress={() => setShowRules(false)} style={[styles.closePickerBtn, { backgroundColor: theme.bgElevated }]}>
                <Text style={{ color: theme.textMuted, fontFamily: 'Lexend_600SemiBold' }}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: { padding: 8, marginLeft: -4 },
  headerTitle: { flex: 1, fontSize: ms(18), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  modeSwitch: { flexDirection: 'row', padding: 3, borderRadius: 999 },
  modeSegment: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  modeText: { fontSize: ms(11), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  prefillBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  prefillBannerText: { flex: 1, fontSize: ms(12), fontFamily: 'Lexend_600SemiBold', fontWeight: '600', lineHeight: ms(18) },
  summaryCard: { marginBottom: 12, borderRadius: 18, borderWidth: 1, padding: 14 },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryLogo: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  summaryLogoImage: { width: '100%', height: '100%' },
  summaryTitle: { fontSize: ms(16), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  summaryBadgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  summaryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  summaryBadgeText: { fontSize: ms(10), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 14, marginTop: 8, borderRadius: 18, backgroundColor: 'rgba(124,58,237,0.06)' },
  sectionHeaderRtl: { flexDirection: 'row-reverse' },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sectionHeaderIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(124,58,237,0.10)', alignItems: 'center', justifyContent: 'center' },
  sectionHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionHeaderTitle: { fontSize: ms(14), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  sectionHeaderSubtitle: { marginTop: 2, fontSize: ms(11), fontFamily: 'Lexend_400Regular', lineHeight: ms(16), opacity: 0.9 },
  prefilledBadge: { fontSize: ms(10), fontFamily: 'Lexend_700Bold', color: '#10B981' },
  prefilledInline: { fontSize: ms(10), fontFamily: 'Lexend_700Bold', color: '#10B981' },
  sectionBody: { paddingTop: 10, paddingBottom: 4 },
  fieldLabel: { marginTop: 12, marginBottom: 6, fontSize: ms(13), fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
  inputShell: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.4 },
  textInput: { flex: 1, fontSize: ms(14.5), fontFamily: 'Lexend_500Medium', fontWeight: '500' },
  textAreaShell: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 100, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 18, borderWidth: 1.4 },
  textArea: { flex: 1, minHeight: 78, fontSize: ms(14.5), fontFamily: 'Lexend_500Medium', fontWeight: '500' },
  counter: { textAlign: 'right', marginTop: 4, fontSize: ms(11), fontFamily: 'Lexend_400Regular' },
  rulesLink: { alignSelf: 'flex-start', marginTop: 10 },
  rulesLinkText: { fontSize: ms(11.5), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  errorHint: { marginTop: 4, fontSize: ms(11), fontFamily: 'Lexend_400Regular' },
  primaryGhostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 16, borderWidth: 1.2, marginBottom: 12 },
  primaryGhostBtnText: { fontSize: ms(13), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  mapWrapper: { marginTop: 12, borderRadius: 20, overflow: 'hidden', height: hp(220), borderWidth: 1.2, borderColor: 'rgba(124,58,237,0.20)' },
  map: { flex: 1 },
  mapHint: { marginTop: 8, fontSize: ms(11.5), fontFamily: 'Lexend_400Regular' },
  gpsIndicator: { marginTop: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpsIndicatorText: { flex: 1, fontSize: ms(11.5), fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
  saveBar: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16 },
  saveButton: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: palette.violet, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveButtonText: { fontSize: ms(14), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  toastWrap: { position: 'absolute', top: 12, left: 16, right: 16, zIndex: 1000, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  toastText: { fontSize: ms(12), fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  absoluteOverlay: { ...StyleSheet.absoluteFillObject, pointerEvents: 'box-none' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
  pickerSheet: { borderRadius: 22, padding: 16, maxHeight: hp(560) },
  pickerTitle: { fontSize: ms(16), fontFamily: 'Lexend_700Bold', fontWeight: '700', marginBottom: 10 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14 },
  categoryRowText: { flex: 1, fontSize: ms(14), fontFamily: 'Lexend_500Medium', fontWeight: '500' },
  closePickerBtn: { marginTop: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14 },
  rulesBody: { fontSize: ms(13), lineHeight: ms(20), fontFamily: 'Lexend_400Regular', marginTop: 4 },
  prefillMini: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  prefillMiniText: { fontSize: ms(11.5), fontFamily: 'Lexend_600SemiBold', fontWeight: '600', lineHeight: ms(16) },
});

export type { StoreFormValues };
