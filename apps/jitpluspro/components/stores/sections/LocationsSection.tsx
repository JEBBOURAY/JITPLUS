import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
  Image as RNImage,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  Plus,
  Trash2,
  Edit3,
  Phone,
  Mail,
  Power,
  Shield,
  AlertTriangle,
} from 'lucide-react-native';
import { JitLock, JitPin, JitStore } from '@/components/icons';
import MapView, { Marker, type SafeMapViewRef } from '@/components/SafeMapView';
import { useTheme, palette, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useRouter } from 'expo-router';
import type { Store as StoreType, Merchant, MerchantCategory } from '@/types';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import { useStoresCRUD, MAX_STORES } from '@/hooks/useStoresCRUD';
import PremiumLockModal from '@/components/PremiumLockModal';
import { resolveImageUrl } from '@/utils/imageUrl';
import { Panel, CountPill, SectionScreen, usePressGuard, useToast, surfaceShadow, fieldFill, ui } from '@/components/stores/StoreUi';
import { DEFAULT_MAP_CENTER, MAP_STYLE } from '@/components/stores/brand';

const JITPRO_LOGO = require('@/assets/images/jitplusprologo.png');

const FREE_MAX_STORES = 1;
const MARKER_SIZE = 38;
const MARKER_LOGO = 26;
const LOCKED_GOLD = '#B45309';
const DEFAULT_REGION = { ...DEFAULT_MAP_CENTER, latitudeDelta: 0.5, longitudeDelta: 0.5 };

function formatAddress(store: StoreType): string {
  return [store.adresse, store.quartier, store.ville].filter(Boolean).join(', ');
}

/** Custom map marker with merchant logo + Android bitmap tracking */
const TrackedStoreMarker = React.memo(function TrackedStoreMarker({
  store, logoUrl,
}: { store: StoreType; logoUrl?: string | null }) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tracking, setTracking] = useState(Platform.OS === 'android');

  // Stop re-rendering the Android marker bitmap shortly after the logo has
  // loaded, or after 800 ms at the latest.
  useEffect(() => {
    if (!tracking) return;
    const timer = setTimeout(() => setTracking(false), loaded ? 100 : 800);
    return () => clearTimeout(timer);
  }, [tracking, loaded]);

  const source = logoUrl && !error ? { uri: resolveImageUrl(logoUrl) } : JITPRO_LOGO;

  return (
    <Marker
      coordinate={{ latitude: store.latitude!, longitude: store.longitude! }}
      title={store.nom}
      description={formatAddress(store)}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
    >
      <View collapsable={false} style={markerStyles.root}>
        <RNImage
          source={source}
          style={markerStyles.logo}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
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
    borderRadius: 12,
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
  logo: { width: MARKER_LOGO, height: MARKER_LOGO, borderRadius: 7 },
});

function DetailRow({ Icon, text, theme }: { Icon: typeof JitPin; text: string; theme: ThemeColors }) {
  const dir = useDir();
  return (
    <View style={[styles.detailRow, { flexDirection: dir.row }]}>
      <Icon size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
      <Text style={[ui.caption, styles.detailText, { color: theme.textSecondary, textAlign: dir.textAlign }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const StoreCard = React.memo(function StoreCard({ store, category, logoUrl, isReference, onEdit, onToggle, onDelete }: {
  store: StoreType;
  category: MerchantCategory;
  logoUrl?: string | null;
  isReference: boolean;
  onEdit: (s: StoreType) => void;
  onToggle: (s: StoreType) => void;
  onDelete: (s: StoreType) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const fill = fieldFill(theme);
  const address = formatAddress(store);

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard }, surfaceShadow(theme)]}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => onEdit(store)}
        style={styles.cardMain}
        accessibilityRole="button"
        accessibilityLabel={`${store.nom}, ${t('stores.editBtn')}`}
      >
        <View style={[styles.cardTopRow, { flexDirection: dir.row }]}>
          <View style={[styles.cardAvatar, { backgroundColor: theme.primaryBg }, !store.isActive && styles.dimmed]}>
            {logoUrl
              ? <ExpoImage source={resolveImageUrl(logoUrl)} style={styles.cardAvatarLogo} contentFit="cover" cachePolicy="memory-disk" />
              : <MerchantCategoryIcon category={category} size={24} />}
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{store.nom}</Text>
            {isReference ? (
              <View style={[styles.metaRow, { flexDirection: dir.row }]}>
                <Shield size={11} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
                <Text style={[ui.caption, { color: theme.textMuted }]} numberOfLines={1}>{t('stores.referenceLabel')}</Text>
              </View>
            ) : null}
          </View>
          <View
            style={[
              styles.statusPill,
              { flexDirection: dir.row, backgroundColor: store.isActive ? theme.success + '1F' : fill },
            ]}
          >
            <View style={[styles.statusDot, { backgroundColor: store.isActive ? theme.success : theme.textMuted }]} />
            <Text style={[styles.statusText, { color: store.isActive ? theme.success : theme.textMuted }]} maxFontSizeMultiplier={1.2}>
              {store.isActive ? t('stores.active') : t('stores.inactive')}
            </Text>
          </View>
        </View>

        {address || store.telephone || store.email ? (
          <View style={styles.details}>
            {address ? <DetailRow Icon={JitPin} text={address} theme={theme} /> : null}
            {store.telephone ? <DetailRow Icon={Phone} text={store.telephone} theme={theme} /> : null}
            {store.email ? <DetailRow Icon={Mail} text={store.email} theme={theme} /> : null}
          </View>
        ) : null}
      </TouchableOpacity>

      <View style={[styles.cardFooter, { flexDirection: dir.row, borderTopColor: theme.borderLight }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { flexDirection: dir.row, backgroundColor: theme.primaryBg }]}
          onPress={() => onEdit(store)}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Edit3 size={16} color={theme.primary} strokeWidth={icon.stroke} />
          <Text style={[styles.actionText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{t('stores.editBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { flexDirection: dir.row, backgroundColor: fill }]}
          onPress={() => onToggle(store)}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Power size={16} color={theme.textSecondary} strokeWidth={icon.stroke} />
          <Text style={[styles.actionText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
            {store.isActive ? t('stores.toggleDeactivate') : t('stores.activateBtn')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconAction, { backgroundColor: theme.danger + '14' }]}
          onPress={() => onDelete(store)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('stores.deleteBtn')}
        >
          <Trash2 size={16} color={theme.danger} strokeWidth={icon.stroke} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

/**
 * "Emplacements" section: overview map + list of the merchant's physical
 * locations. Create / edit go through the /store-form screen.
 */
export default function LocationsSection({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const dir = useDir();
  const toast = useToast();

  const { isPremium } = usePlanStatus(merchant);
  const effectiveMax = isPremium ? MAX_STORES : FREE_MAX_STORES;

  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  // Custom delete confirmation: explicit two-step flow and a hard block on
  // removing the last/reference store.
  const [deleteTarget, setDeleteTarget] = useState<StoreType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const overviewMapRef = useRef<SafeMapViewRef>(null);

  const {
    stores, loading, refreshing, onRefresh,
    alertMaxStores, deleteStoreDirect, toggleActive,
  } = useStoresCRUD();

  const storesWithCoords = useMemo(
    () => stores.filter((s) => s.latitude != null && s.longitude != null),
    [stores],
  );

  const initialRegion = useMemo(() => {
    if (storesWithCoords.length === 0) return DEFAULT_REGION;
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

  // Re-frame the map when stores are added, moved or removed.
  useEffect(() => {
    if (storesWithCoords.length === 0) return;
    const timer = setTimeout(() => {
      if (storesWithCoords.length === 1) {
        overviewMapRef.current?.animateToRegion?.({
          latitude: storesWithCoords[0].latitude!,
          longitude: storesWithCoords[0].longitude!,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      } else {
        overviewMapRef.current?.fitToCoordinates?.(
          storesWithCoords.map((s) => ({ latitude: s.latitude!, longitude: s.longitude! })),
          { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true },
        );
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [storesWithCoords]);

  const atLimit = stores.length >= effectiveMax;
  const lockedByPlan = atLimit && !isPremium;
  const canAdd = stores.length < MAX_STORES;

  const guarded = usePressGuard();
  const openCreate = useCallback(() => {
    if (stores.length >= effectiveMax) {
      if (!isPremium) setPremiumModalVisible(true);
      else alertMaxStores();
      return;
    }
    guarded(() => router.push({ pathname: '/store-form', params: { mode: 'create' } }));
  }, [stores.length, effectiveMax, isPremium, alertMaxStores, guarded, router]);

  const openEdit = useCallback((store: StoreType) => {
    guarded(() => router.push({ pathname: '/store-form', params: { storeId: store.id } }));
  }, [guarded, router]);

  const handleDelete = useCallback((store: StoreType) => setDeleteTarget(store), []);

  const showToast = toast.show;

  // Removing the only store would leave the merchant unable to operate, so it
  // is blocked outright.
  const isOnlyStore = stores.length <= 1;

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteStoreDirect(deleteTarget);
    setDeleting(false);
    if (ok) setDeleteTarget(null);
  }, [deleteTarget, deleteStoreDirect]);

  const handleToggleActive = useCallback((store: StoreType) => {
    const run = async () => {
      if (await toggleActive(store)) {
        showToast(store.isActive ? t('stores.deactivatedToast') : t('stores.activatedToast'));
      }
    };
    if (!store.isActive) {
      run();
      return;
    }
    Alert.alert(
      t('stores.toggleInactiveTitle'),
      t('stores.toggleInactiveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('stores.toggleDeactivate'), style: 'destructive', onPress: run },
      ],
    );
  }, [showToast, toggleActive, t]);

  const shadow = surfaceShadow(theme);

  const addButton = canAdd ? (
    <ActionButton
      onPress={openCreate}
      variant={lockedByPlan ? 'secondary' : 'primary'}
      icon={lockedByPlan ? JitLock : Plus}
      label={lockedByPlan ? t('stores.unlockMoreStores') : t('stores.addStoreFull')}
      style={lockedByPlan ? styles.addBtnLocked : styles.addBtnRaised}
      labelStyle={lockedByPlan ? styles.addBtnLockedText : undefined}
      iconColor={lockedByPlan ? LOCKED_GOLD : undefined}
    />
  ) : (
    <Text style={[ui.caption, styles.limitText, { color: theme.textMuted }]}>
      {t('stores.maxReached', { max: MAX_STORES })}
    </Text>
  );

  return (
    <SectionScreen
      title={t('storesHub.locationsTitle')}
      caption={t('stores.locationsCaption')}
      toast={toast.message}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      {loading ? (
        <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
      ) : stores.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.bgCard }, shadow]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.primaryBg }]}>
            <JitStore size={32} color={theme.primary} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('stores.noStores')}</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('stores.noStoresHint')}</Text>
          <View style={styles.emptyAction}>{addButton}</View>
        </View>
      ) : (
        <>
          <Panel
            Icon={JitStore}
            title={t('stores.locationsTitle')}
            right={<CountPill value={`${stores.length}/${effectiveMax}`} />}
          >
            {storesWithCoords.length > 0 ? (
              <View style={[styles.mapWrap, { backgroundColor: fieldFill(theme) }]}>
                {/* Static overview: a pannable map inside a vertical
                    ScrollView traps the scroll gesture. */}
                <MapView
                  ref={overviewMapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={initialRegion}
                  customMapStyle={MAP_STYLE}
                  showsPointsOfInterests={false}
                  showsBuildings={false}
                  showsIndoors={false}
                  showsTraffic={false}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  {storesWithCoords.map((store) => (
                    <TrackedStoreMarker key={store.id} store={store} logoUrl={merchant.logoUrl} />
                  ))}
                </MapView>
              </View>
            ) : null}
            {addButton}
          </Panel>

          <View style={styles.list}>
            {stores.map((store, index) => (
              <StoreCard
                key={store.id}
                store={store}
                category={merchant.categorie}
                logoUrl={merchant.logoUrl}
                isReference={index === 0}
                onEdit={openEdit}
                onToggle={handleToggleActive}
                onDelete={handleDelete}
              />
            ))}
          </View>
        </>
      )}

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
                ? <Shield size={26} color={theme.danger} strokeWidth={icon.stroke} />
                : <AlertTriangle size={26} color={theme.danger} strokeWidth={icon.stroke} />}
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
              <View style={[styles.deleteWarning, { backgroundColor: theme.warning + '1A' }]}>
                <Text style={[ui.caption, { color: theme.textSecondary, textAlign: 'center' }]}>
                  {t('stores.deleteReferenceWarning')}
                </Text>
              </View>
            )}

            {isOnlyStore ? (
              <ActionButton
                label={t('stores.deleteGotIt')}
                onPress={() => setDeleteTarget(null)}
                style={styles.sheetBtnFull}
              />
            ) : (
              <View style={[styles.sheetActions, { flexDirection: dir.row }]}>
                <ActionButton
                  label={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setDeleteTarget(null)}
                  disabled={deleting}
                  style={[styles.sheetBtn, styles.sheetBtnCancel, { backgroundColor: fieldFill(theme) }]}
                />
                <ActionButton
                  label={t('common.delete')}
                  variant="danger"
                  icon={Trash2}
                  onPress={confirmDelete}
                  loading={deleting}
                  style={styles.sheetBtn}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      <PremiumLockModal
        visible={premiumModalVisible}
        onClose={() => setPremiumModalVisible(false)}
        titleKey="storesCrud.storesLockedTitle"
        descKey="storesCrud.storesLockedMsg"
      />
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 48 },
  dimmed: { opacity: 0.5 },

  mapWrap: { height: 168, borderRadius: 12, overflow: 'hidden', marginBottom: 14 },
  addBtnRaised: { backgroundColor: palette.violet, borderColor: palette.violet, borderBottomWidth: 3, borderBottomColor: palette.violetDark, shadowColor: palette.violet, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.24, shadowRadius: 10, elevation: 3 },
  addBtnLocked: { backgroundColor: palette.gold + '2E', borderColor: 'transparent', borderBottomWidth: 3 },
  addBtnLockedText: { color: LOCKED_GOLD },
  limitText: { textAlign: 'center' },

  list: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  card: { borderRadius: 16 },
  cardMain: { padding: 16, paddingBottom: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardAvatar: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardAvatarLogo: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, gap: 3 },
  cardName: { fontSize: 16, fontFamily: font.semibold, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: font.semibold },
  details: { marginTop: 14, gap: 7 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flex: 1 },
  cardFooter: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 44, borderRadius: 12 },
  actionText: { fontSize: 13, fontFamily: font.semibold },
  iconAction: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  empty: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyIcon: { width: 72, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, marginTop: 16, fontFamily: font.semibold, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, fontFamily: font.regular },
  emptyAction: { alignSelf: 'stretch', marginTop: 20 },

  deleteOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', paddingHorizontal: 28 },
  deleteSheet: { borderRadius: 16, padding: 22, alignItems: 'center' },
  deleteIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  deleteSheetTitle: { fontSize: 17, textAlign: 'center', fontFamily: font.semibold, letterSpacing: -0.2 },
  deleteSheetBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, fontFamily: font.regular },
  deleteWarning: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, alignSelf: 'stretch' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
  sheetBtn: { flex: 1 },
  sheetBtnCancel: { borderColor: 'transparent' },
  sheetBtnFull: { alignSelf: 'stretch', marginTop: 20, backgroundColor: palette.violet, borderColor: palette.violet },
});
