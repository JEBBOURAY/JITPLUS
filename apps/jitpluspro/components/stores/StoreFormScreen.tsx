import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { Redirect, useRouter } from 'expo-router';
import { Check, Mail, MapPin, Navigation, Phone, Store } from 'lucide-react-native';
import { useAuth, useAuthActions } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStoresCRUD } from '@/hooks/useStoresCRUD';
import PhoneInput, { parsePhone } from '@/components/PhoneInput';
import { isValidPhoneForCountry, normalizePhone } from '@jitplus/shared';
import AddressAutocomplete, { type AddressResult } from '@/components/AddressAutocomplete';
import SafeMapView, { Marker, type SafeMapViewRef } from '@/components/SafeMapView';
import { reverseGeocodeAsync } from '@/utils/geocodeCache';
import type { CreateStorePayload, Store as StoreType } from '@/types';
import {
  Panel, SaveBar, SectionScreen, TextField, OwnerOnlyNotice, useDiscardGuard, queueToast, haptic, fieldFill, ui,
} from '@/components/stores/StoreUi';
import { MAP_STYLE } from '@/components/stores/brand';

const NAME_MIN = 2;
const NAME_MAX = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };
const MAP_DELTA = { latitudeDelta: 0.045, longitudeDelta: 0.045 };

type StoreForm = {
  nom: string;
  telephone: string;
  email: string;
  adresse: string;
  quartier: string;
  ville: string;
  latitude: number | null;
  longitude: number | null;
};

const TEXT_KEYS = ['nom', 'email', 'adresse', 'quartier', 'ville'] as const;

/**
 * Stored phones are always international (+212…), including legacy local
 * values such as "06 12 34 56 78". PhoneInput emits the bare dial code
 * ("+212") once the number is erased, which means "no phone".
 */
function cleanPhone(raw: string): string {
  const value = normalizePhone(raw.trim());
  return parsePhone(value).localPart ? value : '';
}

function toForm(store: StoreType | null): StoreForm {
  return {
    nom: store?.nom ?? '',
    telephone: store?.telephone ?? '',
    email: store?.email ?? '',
    adresse: store?.adresse ?? '',
    quartier: store?.quartier ?? '',
    ville: store?.ville ?? '',
    latitude: store?.latitude ?? null,
    longitude: store?.longitude ?? null,
  };
}

interface Props {
  mode: 'create' | 'edit';
  storeId?: string;
}

/**
 * Create / edit one physical location: its name, address and direct contact.
 * Everything shared by all locations (description, category, social links,
 * hours…) is edited on the brand from the "Ma boutique" hub.
 */
export default function StoreFormScreen({ mode, storeId }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const { isTeamMember } = useAuth();
  const { updateMerchant } = useAuthActions();
  const { stores, loading, saving, canCreateStore, alertMaxStores, saveStore } = useStoresCRUD();

  const isCreate = mode === 'create';
  const store = isCreate ? null : stores.find((s) => s.id === storeId) ?? null;
  const isReference = !!store && stores[0]?.id === store.id;
  const saved = useMemo(() => toForm(store), [store]);

  const [form, setForm] = useState<StoreForm>(saved);
  const [addressQuery, setAddressQuery] = useState(saved.adresse);
  const [submitted, setSubmitted] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const mapRef = useRef<SafeMapViewRef>(null);

  // The store may only arrive after mount (cold cache): load it into the draft
  // once, without overwriting edits on later background refetches.
  const [loadedId, setLoadedId] = useState(store?.id ?? null);
  if (store && store.id !== loadedId) {
    setLoadedId(store.id);
    setForm(saved);
    setAddressQuery(saved.adresse);
  }

  const phone = cleanPhone(form.telephone);
  const dirty = TEXT_KEYS.some((k) => form[k].trim() !== saved[k].trim())
    || phone !== cleanPhone(saved.telephone)
    || form.latitude !== saved.latitude
    || form.longitude !== saved.longitude;
  const bypassGuard = useDiscardGuard(dirty, saving);

  const nameError = submitted && form.nom.trim().length < NAME_MIN ? t('stores.nameRequired') : null;
  const emailError = form.email.trim() && !EMAIL_RE.test(form.email.trim()) ? t('storesHub.emailInvalid') : null;
  const phoneInvalid = useMemo(() => {
    if (!phone) return false;
    const { localPart, country } = parsePhone(phone);
    return !isValidPhoneForCountry(localPart, country);
  }, [phone]);
  // Shown after a save attempt only, so it does not flash while typing.
  const phoneError = submitted && phoneInvalid ? t('storesHub.phoneInvalid') : null;

  const patch = useCallback((next: Partial<StoreForm>) => setForm((prev) => ({ ...prev, ...next })), []);

  const placePin = useCallback(async (latitude: number, longitude: number) => {
    patch({ latitude, longitude });
    // Saving stays disabled until the address catches up with the new pin,
    // otherwise a quick save would persist the old address with new coordinates.
    setGeocoding(true);
    try {
      const [g] = await reverseGeocodeAsync({ latitude, longitude });
      if (!g) return;
      const label = [g.street, g.name, g.district, g.subregion].filter(Boolean).join(', ');
      setAddressQuery(label);
      setForm((prev) => ({
        ...prev,
        adresse: label || prev.adresse,
        ville: g.city || prev.ville,
        quartier: g.district || prev.quartier,
      }));
    } catch {
      // The pin is placed even when the address lookup fails.
    } finally {
      setGeocoding(false);
    }
  }, [patch]);

  const selectAddress = useCallback((result: AddressResult) => {
    setAddressQuery(result.address);
    setForm((prev) => ({
      ...prev,
      adresse: result.formattedAddress || result.address,
      ville: result.city || prev.ville,
      quartier: result.district || prev.quartier,
      latitude: result.latitude,
      longitude: result.longitude,
    }));
    mapRef.current?.animateToRegion({ latitude: result.latitude, longitude: result.longitude, ...MAP_DELTA });
  }, []);

  const locateMe = useCallback(async () => {
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
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion({ latitude: coords.latitude, longitude: coords.longitude, ...MAP_DELTA });
      await placePin(coords.latitude, coords.longitude);
    } catch {
      Alert.alert(t('common.error'), t('stores.locationError'));
    } finally {
      setLocating(false);
    }
  }, [placePin, t]);

  // Re-entrancy guard: a double-tap in the same frame as the mutation starting
  // must not create the store twice (isPending only disables the button after
  // the next render).
  const savingRef = useRef(false);
  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setSubmitted(true);
      if (form.nom.trim().length < NAME_MIN || emailError || phoneInvalid) return;
      if (isCreate && !canCreateStore) {
        alertMaxStores();
        return;
      }
      const payload: CreateStorePayload = {
        nom: form.nom.trim(),
        // null clears a phone / email that was removed from an existing store.
        telephone: phone || (isCreate ? undefined : null),
        email: form.email.trim() || (isCreate ? undefined : null),
        adresse: form.adresse.trim() || undefined,
        quartier: form.quartier.trim() || undefined,
        ville: form.ville.trim() || undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
      };
      if (!(await saveStore(payload, store?.id))) return;
      // The backend copies the reference store's location onto the merchant.
      if (isReference) {
        updateMerchant({
          adresse: payload.adresse, quartier: payload.quartier, ville: payload.ville,
          latitude: payload.latitude, longitude: payload.longitude,
        });
      }
      haptic();
      bypassGuard();
      queueToast(t(isCreate ? 'stores.createdToast' : 'stores.savedToast'));
      router.back();
    } finally {
      savingRef.current = false;
    }
  }, [form, phone, emailError, phoneInvalid, isCreate, canCreateStore, alertMaxStores, saveStore, store?.id, isReference, updateMerchant, bypassGuard, t, router]);

  if (isTeamMember) return <OwnerOnlyNotice />;
  // A stale link to a deleted store.
  if (!isCreate && !loading && !store) return <Redirect href="/stores" />;

  const hasPin = form.latitude != null && form.longitude != null;
  const region = {
    latitude: form.latitude ?? CASABLANCA.latitude,
    longitude: form.longitude ?? CASABLANCA.longitude,
    ...MAP_DELTA,
  };

  return (
    <SectionScreen
      title={isCreate ? t('stores.newStore') : store?.nom || t('stores.editStore')}
      caption={isReference ? t('storesHub.referenceCaption') : t('storesHub.storeFormCaption')}
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving || geocoding}
          onSave={save}
          label={isCreate ? t('stores.createStore') : t('stores.saveChanges')}
        />
      }
    >
      {loading && !store && !isCreate ? (
        <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
      ) : (
        <>
          <Panel Icon={Store} title={t('stores.sectionInfo')}>
            <TextField
              label={t('stores.nameLabel')}
              value={form.nom}
              onChangeText={(nom) => patch({ nom })}
              placeholder={t('stores.namePlaceholder')}
              maxLength={NAME_MAX}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus={isCreate}
              returnKeyType="done"
              error={nameError}
              hint={t('storesHub.storeNameHint')}
            />
          </Panel>

          <Panel Icon={MapPin} title={t('stores.sectionLocation')} caption={t('stores.stepLocationDesc')}>
            <TouchableOpacity
              onPress={locateMe}
              disabled={locating}
              activeOpacity={0.8}
              style={[styles.locateBtn, { backgroundColor: theme.primaryBg }]}
              accessibilityRole="button"
              accessibilityState={{ busy: locating }}
            >
              {locating
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <Navigation size={16} color={theme.primary} strokeWidth={2} />}
              <Text style={[styles.locateText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{t('stores.locateMe')}</Text>
            </TouchableOpacity>

            <Text style={[ui.fieldLabel, styles.label, { color: theme.text }]}>{t('stores.searchAddress')}</Text>
            <AddressAutocomplete
              value={addressQuery}
              onChangeText={setAddressQuery}
              onSelect={selectAddress}
              onNotFound={() => Alert.alert(t('common.error'), t('stores.addressNotFound'))}
              notFoundMessage={t('stores.addressNotFoundManual')}
              placeholder={t('stores.addressSearchPlaceholder')}
              ville={form.ville}
              userLocation={hasPin ? { latitude: form.latitude!, longitude: form.longitude! } : null}
            />

            <View style={[styles.mapWrap, { backgroundColor: fieldFill(theme) }]}>
              <SafeMapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={region}
                onPress={(e) => void placePin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
                showsUserLocation={false}
                pitchEnabled={false}
                rotateEnabled={false}
                customMapStyle={MAP_STYLE}
                showsPointsOfInterests={false}
                showsBuildings={false}
              >
                {hasPin ? (
                  <Marker
                    draggable
                    coordinate={{ latitude: form.latitude!, longitude: form.longitude! }}
                    pinColor={palette.violet}
                    onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) =>
                      void placePin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
                  />
                ) : null}
              </SafeMapView>
            </View>
            {hasPin ? (
              <View style={[styles.pinRow, { backgroundColor: theme.primaryBg }]}>
                <Check size={14} color={theme.primary} strokeWidth={2.5} />
                <Text style={[ui.caption, styles.pinText, { color: theme.primary }]} numberOfLines={2}>
                  {form.adresse || `${form.latitude!.toFixed(5)}, ${form.longitude!.toFixed(5)}`}
                </Text>
              </View>
            ) : (
              <Text style={[ui.caption, styles.mapHint, { color: theme.textMuted }]}>{t('stores.mapHint')}</Text>
            )}
          </Panel>

          <Panel Icon={Phone} title={t('stores.sectionContact')} caption={t('storesHub.storeContactCaption')}>
            <Text style={[ui.fieldLabel, styles.phoneLabel, { color: theme.text }]}>{t('stores.phoneLabel')}</Text>
            <PhoneInput
              value={form.telephone}
              onChangeText={(telephone) => patch({ telephone })}
              showValidation={false}
              placeholder={t('stores.phonePlaceholder')}
            />
            {phoneError ? (
              <View style={ui.fieldFooter}>
                <Text style={[ui.caption, ui.fieldHint, { color: theme.danger }]} maxFontSizeMultiplier={1.3}>{phoneError}</Text>
              </View>
            ) : null}
            <View style={styles.gap} />
            <TextField
              label={t('stores.emailLabel')}
              Icon={Mail}
              value={form.email}
              onChangeText={(email) => patch({ email })}
              placeholder={t('stores.emailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              maxLength={255}
              error={emailError}
            />
          </Panel>
        </>
      )}
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 48 },
  label: { marginTop: 16, marginBottom: 7 },
  phoneLabel: { marginBottom: 7 },
  gap: { height: 14 },
  locateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 13 },
  locateText: { fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },
  mapWrap: { height: 220, borderRadius: 16, overflow: 'hidden', marginTop: 14 },
  mapHint: { marginTop: 8 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12 },
  pinText: { flex: 1 },
});
