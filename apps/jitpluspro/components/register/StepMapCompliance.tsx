import React, { RefObject } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, Linking, Platform,
} from 'react-native';
import { Search, MapPin, MapPinned, Phone, Check, Gift } from 'lucide-react-native';
import SafeMapView, { Marker, PROVIDER_GOOGLE } from '@/components/SafeMapView';
import type { SafeMapViewRef } from '@/components/SafeMapView';
import AddressAutocomplete, { AddressResult } from '@/components/AddressAutocomplete';
import * as Location from 'expo-location';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface Props {
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  googleIdToken: string | null;
  phoneNumber: string;
  setPhoneNumber: (v: string) => void;
  latitude: number | null;
  setLatitude: (v: number) => void;
  longitude: number | null;
  setLongitude: (v: number) => void;
  addressSearch: string;
  setAddressSearch: (v: string) => void;
  addressLabel: string;
  isGeoSearching: boolean;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
  triedSubmit: boolean;
  referralCode: string;
  referralStatus: string;
  referralNom: string;
  handleReferralCodeChange: (text: string) => void;
  handleAddressSearch: () => void;
  reverseGeocodeAndLabel: (lat: number, lng: number) => void;
  onAddressSelect?: (result: AddressResult) => void;
  ville?: string;
  setReferralCode: (v: string) => void;
  setReferralStatus: (v: 'idle' | 'verifying' | 'valid' | 'invalid') => void;
  setReferralNom: (v: string) => void;
  mapRef: RefObject<SafeMapViewRef | null>;
  googleMapsApiKey: string;
}

export function StepMapCompliance({
  theme, t, googleIdToken, phoneNumber, setPhoneNumber,
  latitude, setLatitude, longitude, setLongitude,
  addressSearch, setAddressSearch, addressLabel, isGeoSearching,
  termsAccepted, setTermsAccepted, triedSubmit,
  referralCode, referralStatus, referralNom, handleReferralCodeChange,
  handleAddressSearch, reverseGeocodeAndLabel,
  onAddressSelect, ville,
  setReferralCode, setReferralStatus, setReferralNom,
  mapRef, googleMapsApiKey,
}: Props) {
  return (
    <>
      {/* Google Maps */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>{t('registerExtra.mapTitle')}</Text>
        <Text style={[styles.hint, { color: theme.textMuted, marginBottom: 10 }]}>
          {t('registerExtra.mapHint')}
        </Text>

        {/* Address search bar with autocomplete */}
        <View style={{ marginBottom: 10, zIndex: 1000 }}>
          <AddressAutocomplete
            value={addressSearch}
            onChangeText={setAddressSearch}
            placeholder={t('registerExtra.addressPlaceholder')}
            ville={ville}
            onSelect={(result: AddressResult) => {
              setLatitude(result.latitude);
              setLongitude(result.longitude);
              setAddressSearch(result.address);
              mapRef.current?.animateToRegion({
                latitude: result.latitude, longitude: result.longitude,
                latitudeDelta: 0.005, longitudeDelta: 0.005,
              });
              onAddressSelect?.(result);
            }}
          />
        </View>

        <View style={styles.mapContainer}>
          <SafeMapView
            ref={mapRef}
            provider={googleMapsApiKey ? PROVIDER_GOOGLE : undefined}
            style={styles.map}
            initialRegion={{
              latitude: latitude || 33.5731,
              longitude: longitude || -7.5898,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
              const coords = e.nativeEvent.coordinate;
              setLatitude(coords.latitude);
              setLongitude(coords.longitude);
              reverseGeocodeAndLabel(coords.latitude, coords.longitude);
            }}
          >
            {latitude && longitude && (
              <Marker
                coordinate={{ latitude, longitude }}
                draggable
                onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                  const coords = e.nativeEvent.coordinate;
                  setLatitude(coords.latitude);
                  setLongitude(coords.longitude);
                  reverseGeocodeAndLabel(coords.latitude, coords.longitude);
                }}
              />
            )}
          </SafeMapView>

          <TouchableOpacity
            style={[styles.locationBtn, { backgroundColor: theme.primary }]}
            onPress={async () => {
              try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert(t('registerExtra.locationDenied'), t('registerExtra.locationDeniedMsg'));
                  return;
                }
                const location = await Location.getCurrentPositionAsync({});
                setLatitude(location.coords.latitude);
                setLongitude(location.coords.longitude);
                mapRef.current?.animateToRegion({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                });
                reverseGeocodeAndLabel(location.coords.latitude, location.coords.longitude);
              } catch {
                Alert.alert(t('common.error'), t('registerExtra.locationError'));
              }
            }}
            activeOpacity={0.8}
          >
            <MapPinned size={18} color="#fff" strokeWidth={1.5} />
            <Text style={styles.locationBtnText}>{t('registerExtra.locateMe')}</Text>
          </TouchableOpacity>
        </View>

        {latitude && longitude && (
          <View style={{ marginTop: 8 }}>
            {addressLabel ? (
              <Text style={[styles.hint, { color: theme.success }]}>📍 {addressLabel}</Text>
            ) : (
              <Text style={[styles.hint, { color: theme.success }]}>
                {t('registerExtra.positionLabel', { lat: latitude.toFixed(6), lng: longitude.toFixed(6) })}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Phone for Google users who skip step 1 */}
      {googleIdToken && (
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>{t('registerExtra.phoneLabel')} *</Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: theme.bgInput,
                borderColor: phoneNumber.trim().length >= 7 ? theme.success : phoneNumber ? theme.primary : theme.border,
              },
            ]}
          >
            <Phone size={20} color={phoneNumber.trim().length >= 7 ? theme.success : theme.textMuted} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder={t('registerExtra.phonePlaceholder')}
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
            {phoneNumber.trim().length >= 7 && <Check size={18} color={theme.success} strokeWidth={2.5} />}
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>{t('registerExtra.phoneHint')}</Text>
        </View>
      )}

      {/* Terms acceptance */}
      <View style={[styles.field, { marginTop: 24 }]}>
        <TouchableOpacity
          style={[styles.termsRow, { borderColor: theme.border }]}
          onPress={() => setTermsAccepted(!termsAccepted)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: termsAccepted ? theme.primary : 'transparent',
                borderColor: termsAccepted ? theme.primary : theme.border,
              },
            ]}
          >
            {termsAccepted && <Check size={16} color="#fff" strokeWidth={1.5} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.termsText, { color: theme.text }]}>
              {t('registerExtra.termsText')}{' '}
              <Text
                style={{ color: theme.primary, fontWeight: '700', textDecorationLine: 'underline' }}
                onPress={() => Linking.openURL('https://jitplus.com/cgu').catch(() => {})}
              >
                {t('register.termsLink')}
              </Text>
              {' '}{t('registerExtra.and')}{' '}
              <Text
                style={{ color: theme.primary, fontWeight: '700', textDecorationLine: 'underline' }}
                onPress={() => Linking.openURL('https://jitplus.com/privacy').catch(() => {})}
              >
                {t('register.privacyLink')}
              </Text>
            </Text>
          </View>
        </TouchableOpacity>
        {triedSubmit && !termsAccepted && (
          <Text style={[styles.hint, { color: theme.danger, marginTop: 8 }]}>
            {t('registerExtra.termsRequired')}
          </Text>
        )}
      </View>

      {/* Referral code */}
      <View style={[styles.field, { marginTop: 4 }]}>
        <Text style={[styles.label, { color: theme.text }]}>{t('referral.referralCodeLabel')}</Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.bgInput,
              borderColor:
                referralStatus === 'valid' ? theme.success
                  : referralStatus === 'invalid' ? theme.danger
                  : referralCode ? theme.primary
                  : theme.border,
            },
          ]}
        >
          <Gift size={20} color={theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={referralCode}
            onChangeText={handleReferralCodeChange}
            placeholder={t('referral.referralCodePlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
            maxLength={12}
            returnKeyType="done"
          />
          {referralStatus === 'verifying' && <ActivityIndicator size="small" color={theme.primary} />}
        </View>

        {referralStatus === 'valid' && (
          <View style={[styles.referralCard, { backgroundColor: `${theme.success}15`, borderColor: `${theme.success}40` }]}>
            <Gift size={20} color={theme.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.referralCardLabel, { color: theme.success }]}>
                {t('referral.referralCodeSponsoredBy')}
              </Text>
              <Text style={[styles.referralCardName, { color: theme.text }]}>{referralNom}</Text>
            </View>
          </View>
        )}

        {referralStatus === 'invalid' && (
          <View style={[styles.referralCard, { backgroundColor: `${theme.danger}10`, borderColor: `${theme.danger}35` }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.hint, { color: theme.danger, marginTop: 0 }]}>
                {t('referral.referralCodeInvalid')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { setReferralCode(''); setReferralStatus('idle'); setReferralNom(''); }}
              style={[styles.referralClearBtn, { borderColor: theme.danger }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.referralClearBtnText, { color: theme.danger }]}>
                {t('referral.referralCodeChangeBtn')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {referralStatus === 'idle' && (
          <Text style={[styles.hint, { color: theme.textMuted }]}>{t('registerExtra.referralHint')}</Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 20 },
  label: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 240,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  map: { flex: 1 },
  locationBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  locationBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  termsText: { fontSize: 13, lineHeight: 20 },
  referralCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginTop: 10,
  },
  referralCardLabel: { fontSize: 12, fontWeight: '600' },
  referralCardName: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  referralClearBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  referralClearBtnText: { fontSize: 12, fontWeight: '700' },
});
