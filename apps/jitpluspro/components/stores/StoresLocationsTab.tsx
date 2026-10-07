import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
  Image as RNImage,
} from 'react-native';
import {
  Store,
  Plus,
  Lock,
  Trash2,
  Edit3,
  MapPin,
  Phone,
  Mail,
  Check,
  ToggleLeft,
  ToggleRight,
  Tag,
  Shield,
  AlertTriangle,
} from 'lucide-react-native';
import MapView, { Marker, SafeMapViewRef } from '@/components/SafeMapView';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Store as StoreType, MerchantCategory } from '@/types';
import MerchantCategoryIcon, { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import { useStoresCRUD, MAX_STORES } from '@/hooks/useStoresCRUD';
import PremiumLockModal from '@/components/PremiumLockModal';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';

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

const FREE_MAX_STORES = 1;
const MARKER_SIZE = ms(38);
const MARKER_LOGO = ms(26);

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

const StoreCard = React.memo(function StoreCard({ store, merchantCategorie, isReference, onActivate, onEdit, onToggle, onDelete }: {
  store: StoreType;
  merchantCategorie?: MerchantCategory;
  isReference?: boolean;
  onActivate: (s: StoreType) => void;
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
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.cardMainPressArea}
          onPress={() => onActivate(store)}
          accessibilityRole="button"
          accessibilityLabel={store.isActive ? t('stores.active') : t('stores.inactive')}
        >
          {/* Top row: avatar + info + status */}
          <View style={styles.cardTopRow}>
            <View style={[styles.cardAvatar, { backgroundColor: palette.violet + '10' }]}>
              <MerchantCategoryIcon category={cat} size={ms(28)} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={1}>{store.nom}</Text>
              {/* Meta row: category (most subdued) + reference (discreet secondary) */}
              <View style={styles.cardMetaRow}>
                <View style={[styles.cardCatBadge, { backgroundColor: theme.bgInput }]}>
                  <Tag size={ms(9)} color={theme.textMuted} strokeWidth={2} />
                  <Text style={[styles.cardCatText, { color: theme.textMuted }]}>{catLabel}</Text>
                </View>
                {isReference && (
                  <View style={[styles.referenceBadge, { backgroundColor: theme.bgInput }]}>
                    <Shield size={ms(9)} color={theme.textSecondary} strokeWidth={2} />
                    <Text style={[styles.referenceBadgeText, { color: theme.textSecondary }]}>{t('stores.referenceLabel')}</Text>
                  </View>
                )}
              </View>
            </View>
            {/* Operational state — most prominent */}
            <View style={[styles.statusBadge, { backgroundColor: store.isActive ? palette.violet : `${theme.danger}14` }]}>
              <View style={[styles.statusDot, { backgroundColor: store.isActive ? '#fff' : theme.danger }]} />
              <Text style={{ fontSize: ms(10.5), fontWeight: '800', color: store.isActive ? '#fff' : theme.danger }}>
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
        </TouchableOpacity>

        {/* Actions — neutral (edit / toggle) */}
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
        </View>

        {/* Destructive action — separated from neutral actions */}
        <View style={[styles.cardDeleteDivider, { backgroundColor: theme.border }]} />
        <TouchableOpacity
          style={styles.cardDeleteBtn}
          onPress={() => onDelete(store)}
          accessibilityRole="button"
          accessibilityLabel={t('stores.deleteBtn')}
        >
          <Trash2 size={ms(13)} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={[styles.cardDeleteText, { color: theme.textMuted }]}>{t('stores.deleteBtn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

/**
 * "Boutiques" tab of /stores: overview map + list of the merchant's physical
 * locations. Create / edit go through the /store-preview store form.
 */
export default function StoresLocationsTab() {
  const theme = useTheme();
  const { merchant } = useAuth();
  const params = useLocalSearchParams<{ toast?: string }>();
  const router = useRouter();
  const { t } = useLanguage();

  const isPremium = merchant?.plan === 'PREMIUM';
  const effectiveMax = isPremium ? MAX_STORES : FREE_MAX_STORES;

  const [premiumModal, setPremiumModal] = useState<{ visible: boolean; titleKey: string; descKey: string }>(
    { visible: false, titleKey: '', descKey: '' },
  );

  const {
    stores, loading, refreshing, onRefresh,
    alertMaxStores, deleteStoreDirect, toggleActive,
  } = useStoresCRUD();

  // Custom delete confirmation: explicit two-step flow and a hard block on
  // removing the last/reference store.
  const [deleteTarget, setDeleteTarget] = useState<StoreType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overviewMapRef = useRef<SafeMapViewRef>(null);

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

  // Fit map to all stores when they change
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

  const openCreate = () => {
    if (stores.length >= effectiveMax) {
      if (!isPremium) {
        setPremiumModal({ visible: true, titleKey: 'storesCrud.storesLockedTitle', descKey: 'storesCrud.storesLockedMsg' });
      } else {
        alertMaxStores();
      }
      return;
    }
    router.push({ pathname: '/store-preview', params: { mode: 'create' } });
  };

  const openEdit = (store: StoreType) => {
    router.push({ pathname: '/store-preview', params: { mode: 'edit', storeId: store.id } });
  };

  const handleDelete = (store: StoreType) => setDeleteTarget(store);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 1700);
  }, []);

  // Clear the param in place: router.replace would mount a fresh /stores
  // screen and drop the toast that was just shown.
  useEffect(() => {
    if (params.toast === 'created') {
      showToast(t('stores.createdToast'));
      router.setParams({ toast: undefined });
    } else if (params.toast === 'saved') {
      showToast(t('stores.savedToast'));
      router.setParams({ toast: undefined });
    }
  }, [params.toast, router, showToast, t]);

  // The reference store is the first one; it is also the last store when there
  // is only one. Removing the only store would leave the merchant unable to
  // operate, so it is blocked outright.
  const isOnlyStore = stores.length <= 1;

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteStoreDirect(deleteTarget);
    setDeleting(false);
    if (ok) setDeleteTarget(null);
  }, [deleteTarget, deleteStoreDirect]);

  // Toggle active (with confirmation when deactivating)
  const handleToggleActive = useCallback(async (store: StoreType) => {
    if (!store.isActive) {
      await toggleActive(store);
      showToast(t('stores.activeUpdatedToast'));
      return;
    }
    Alert.alert(
      t('stores.toggleInactiveTitle'),
      t('stores.toggleInactiveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('stores.toggleDeactivate'), style: 'destructive', onPress: async () => { await toggleActive(store); showToast(t('stores.activeUpdatedToast')); } },
      ],
    );
  }, [showToast, toggleActive, t]);

  return (
    <View style={styles.container}>
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

      {/* Overview Map */}
      {!loading && storesWithCoords.length > 0 && (
        <View style={styles.overviewMapWrapper}>
          <MapView
            ref={overviewMapRef}
            style={styles.overviewMap}
            region={overviewRegion}
            customMapStyle={MAP_STYLE}
            showsPointsOfInterests={false}
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
          {/* Guide text */}
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
              onActivate={handleToggleActive}
              onEdit={openEdit}
              onToggle={handleToggleActive}
              onDelete={handleDelete}
            />
          ))}
        </ScrollView>
      )}

      {toastMessage ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={[styles.toast, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <Check size={14} color={palette.violet} strokeWidth={2.5} />
            <Text style={[styles.toastText, { color: theme.text }]}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}

      {/* Delete confirmation: explicit two-step flow + hard block on last store */}
      <Modal
        visible={!!deleteTarget}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => { if (!deleting) setDeleteTarget(null); }}
      >
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteSheet, { backgroundColor: theme.bgCard }]}>
            <View style={[styles.deleteIconWrap, { backgroundColor: theme.danger + '14' }]}>
              {isOnlyStore
                ? <Shield size={ms(26)} color={theme.danger} strokeWidth={2} />
                : <AlertTriangle size={ms(26)} color={theme.danger} strokeWidth={2} />}
            </View>
            <Text style={[styles.deleteSheetTitle, { color: theme.text }]}>
              {isOnlyStore ? t('stores.deleteBlockedTitle') : t('stores.deleteConfirmTitle')}
            </Text>
            <Text style={[styles.deleteSheetBody, { color: theme.textSecondary }]}>
              {isOnlyStore
                ? t('stores.deleteBlockedMsg')
                : t('stores.deleteConfirmMsg', { name: deleteTarget?.nom ?? '' })}
            </Text>
            {!isOnlyStore && deleteTarget && stores[0]?.id === deleteTarget.id && (
              <Text style={[styles.deleteRefWarning, { color: theme.warning }]}>
                {t('stores.deleteReferenceWarning')}
              </Text>
            )}

            {isOnlyStore ? (
              <TouchableOpacity
                style={[styles.deleteBtnPrimary, { backgroundColor: theme.primary }]}
                onPress={() => setDeleteTarget(null)}
              >
                <Text style={styles.deleteBtnPrimaryText}>{t('stores.deleteGotIt')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.deleteSheetActions}>
                <TouchableOpacity
                  style={[styles.deleteBtnGhost, { backgroundColor: theme.bgInput }]}
                  onPress={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  <Text style={[styles.deleteBtnGhostText, { color: theme.text }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteBtnDanger, { backgroundColor: theme.danger, opacity: deleting ? 0.6 : 1 }]}
                  onPress={confirmDelete}
                  disabled={deleting}
                >
                  {deleting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Trash2 size={ms(15)} color="#fff" strokeWidth={2} />}
                  <Text style={styles.deleteBtnDangerText}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
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
  cardMainPressArea: {
    flex: 1,
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
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: ms(6), marginTop: ms(5) },
  cardCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(3),
    alignSelf: 'flex-start',
    paddingHorizontal: ms(7),
    paddingVertical: ms(3),
    borderRadius: ms(7),
  },
  cardCatText: { fontSize: ms(10), fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(5),
    paddingHorizontal: ms(9),
    paddingVertical: ms(4),
    borderRadius: ms(9),
  },
  statusDot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  cardDetail: { flexDirection: 'row', alignItems: 'center', gap: ms(6), marginTop: ms(6) },
  cardDetailText: { fontSize: ms(12), flex: 1, fontFamily: 'Lexend_400Regular' },
  cardActions: { flexDirection: 'row', gap: ms(8), marginTop: ms(14) },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: ms(24),
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    paddingHorizontal: ms(14),
    paddingVertical: ms(10),
    borderRadius: ms(999),
    borderWidth: 1,
  },
  toastText: {
    fontSize: ms(12),
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
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
  cardDeleteDivider: { height: StyleSheet.hairlineWidth, marginTop: ms(12), marginBottom: ms(2) },
  cardDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(6),
    paddingVertical: ms(8),
  },
  cardDeleteText: { fontSize: ms(11.5), fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: ms(28) },
  deleteSheet: { borderRadius: ms(20), padding: ms(22), alignItems: 'center' },
  deleteIconWrap: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ms(14),
  },
  deleteSheetTitle: { fontSize: ms(17), fontWeight: '700', textAlign: 'center', fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  deleteSheetBody: { fontSize: ms(13.5), lineHeight: ms(20), textAlign: 'center', marginTop: ms(8), fontFamily: 'Lexend_400Regular' },
  deleteRefWarning: { fontSize: ms(12), lineHeight: ms(17), textAlign: 'center', marginTop: ms(10), fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  deleteSheetActions: { flexDirection: 'row', gap: ms(10), marginTop: ms(20), alignSelf: 'stretch' },
  deleteBtnGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: ms(13), borderRadius: ms(13) },
  deleteBtnGhostText: { fontSize: ms(14), fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  deleteBtnDanger: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ms(7), paddingVertical: ms(13), borderRadius: ms(13) },
  deleteBtnDangerText: { fontSize: ms(14), fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
  deleteBtnPrimary: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: ms(13), borderRadius: ms(13), marginTop: ms(20) },
  deleteBtnPrimaryText: { fontSize: ms(14), fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
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
});
