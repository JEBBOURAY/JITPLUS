import React, { useReducer, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
// Reanimated removed — plain View shim
const Animated = { View } as const;
import { useRouter } from 'expo-router';
import {
  ChevronRight,
  Check,
  ArrowLeft,
  MapPin,
} from 'lucide-react-native';
import type { SafeMapViewRef } from '@/components/SafeMapView';
import { geocodeAsync, reverseGeocodeAsync } from '@/utils/geocodeCache';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import { MerchantCategory } from '@/types';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { isValidEmail } from '@/utils/validation';
import { getErrorMessage } from '@/utils/error';
import { VILLES } from '@/constants/villes';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import { StepIdentity } from '@/components/register/StepIdentity';
import { StepCredentials } from '@/components/register/StepCredentials';
import { StepMapCompliance } from '@/components/register/StepMapCompliance';

// ── Register form state ─────────────────────────────────────────────
interface RegState {
  step: number;
  googleIdToken: string | null;
  nom: string;
  categorie: MerchantCategory | null;
  email: string;
  password: string;
  phoneNumber: string;
  showPassword: boolean;
  ville: string;
  quartier: string;
  villeSearch: string;
  latitude: number | null;
  longitude: number | null;
  termsAccepted: boolean;
  isLoading: boolean;
  triedSubmit: boolean;
  referralCode: string;
  referralStatus: 'idle' | 'verifying' | 'valid' | 'invalid';
  referralNom: string;
  addressSearch: string;
  addressLabel: string;
  isGeoSearching: boolean;
}

type RegAction =
  | { type: 'SET'; payload: Partial<RegState> }
  | { type: 'NEXT_STEP'; googleIdToken: string | null }
  | { type: 'PREV_STEP'; googleIdToken: string | null }
  | { type: 'REFERRAL_CHANGE'; code: string }
  | { type: 'REFERRAL_VERIFIED'; status: 'valid' | 'invalid'; nom?: string }
  | { type: 'SET_LOADING'; loading: boolean };

const initialRegState: RegState = {
  step: 0,
  googleIdToken: null,
  nom: '',
  categorie: null,
  email: '',
  password: '',
  phoneNumber: '',
  showPassword: false,
  ville: '',
  quartier: '',
  villeSearch: '',
  latitude: null,
  longitude: null,
  termsAccepted: false,
  isLoading: false,
  triedSubmit: false,
  referralCode: '',
  referralStatus: 'idle',
  referralNom: '',
  addressSearch: '',
  addressLabel: '',
  isGeoSearching: false,
};

function regReducer(state: RegState, action: RegAction): RegState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'NEXT_STEP': {
      const nextStep = (state.step === 0 && action.googleIdToken) ? 2 : state.step + 1;
      return { ...state, step: nextStep };
    }
    case 'PREV_STEP': {
      const prevStep = (state.step === 2 && action.googleIdToken) ? 0 : state.step - 1;
      return { ...state, step: prevStep };
    }
    case 'REFERRAL_CHANGE': {
      const code = action.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return { ...state, referralCode: code, referralStatus: 'idle', referralNom: '' };
    }
    case 'REFERRAL_VERIFIED':
      return {
        ...state,
        referralStatus: action.status,
        referralNom: action.status === 'valid' ? (action.nom ?? '') : '',
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    default:
      return state;
  }
}

// ── Referral code verification ─────────────────────────────────────────────
async function verifyReferralCode(code: string): Promise<{ id: string; nom: string } | null> {
  try {
    const { data } = await api.get(`/auth/referral/check/${encodeURIComponent(code.trim().toUpperCase())}`);
    return data as { id: string; nom: string };
  } catch {
    return null;
  }
}

const TOTAL_STEPS = 4;

// ── Step indicator ────────────────────────────────────────
function StepIndicator({
  current,
  total,
  theme,
  labels,
}: {
  current: number;
  total: number;
  theme: ReturnType<typeof useTheme>;
  labels: string[];
}) {
  return (
    <View style={si.container}>
      {Array.from({ length: total }, (_, i) => {
        const isActive = i <= current;
        const isCurrent = i === current;
        return (
          <View key={i} style={si.stepCol}>
            <View style={si.dotRow}>
              <View
                style={[
                  si.dot,
                  {
                    backgroundColor: isActive ? theme.primary : theme.border,
                    width: isCurrent ? 28 : 10,
                  },
                ]}
              />
            </View>
            {isCurrent && (
              <Text style={[si.label, { color: theme.primary }]}>{labels[i]}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const si = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  stepCol: { alignItems: 'center' },
  dotRow: { alignItems: 'center' },
  dot: { height: 10, borderRadius: 5 },
  label: { fontSize: 11, fontWeight: '600', marginTop: 4, letterSpacing: 0.3 },
});

// ── Main ──────────────────────────────────────────────────
export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { googleRegister } = useAuth();

  // Steps: 0 = Identité, 1 = Identifiants, 2 = Localisation, 3 = Position GPS + Conformité
  const [s, dispatch] = useReducer(regReducer, initialRegState);
  const set = useCallback((patch: Partial<RegState>) => dispatch({ type: 'SET', payload: patch }), []);

  const {
    step, googleIdToken, nom, categorie, email, password, phoneNumber,
    showPassword, ville, quartier, villeSearch, latitude, longitude,
    termsAccepted, isLoading, triedSubmit, referralCode, referralStatus,
    referralNom, addressSearch, addressLabel, isGeoSearching,
  } = s;
  const referralTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useLanguage();

  // Clean up referral debounce timer on unmount
  useEffect(() => {
    return () => {
      if (referralTimer.current) clearTimeout(referralTimer.current);
    };
  }, []);

  // Google ID token capture for registration
  const handleGoogleToken = useCallback((idToken: string) => {
    set({ googleIdToken: idToken });
    // Skip step 1 (credentials) — jump to step 2 (location)
    // Only skip if step 0 is complete (nom + categorie filled)
    if (step <= 0 && nom.trim().length > 0 && categorie !== null) {
      set({ step: 2 });
    }
  }, [step, set, nom, categorie]);
  const google = useGoogleIdToken(handleGoogleToken);

  // Google Maps API key
  const googleMapsApiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey ?? '';

  // Refs
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const quartierRef = useRef<TextInput>(null);
  const mapRef = useRef<SafeMapViewRef>(null);

  // ── Referral code debounced check ──
  const handleReferralCodeChange = useCallback((text: string) => {
    dispatch({ type: 'REFERRAL_CHANGE', code: text });
    const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (referralTimer.current) clearTimeout(referralTimer.current);
    if (code.length >= 6) {
      set({ referralStatus: 'verifying' });
      referralTimer.current = setTimeout(async () => {
        const result = await verifyReferralCode(code);
        if (result) {
          dispatch({ type: 'REFERRAL_VERIFIED', status: 'valid', nom: result.nom });
        } else {
          dispatch({ type: 'REFERRAL_VERIFIED', status: 'invalid' });
        }
      }, 600);
    }
  }, [set]);

  // ── Validation per step ──
  const canProceed = () => {
    if (step === 0) return nom.trim().length > 0 && categorie !== null;
    if (step === 1) {
      // Google users skip this step; if somehow here, always valid
      if (googleIdToken) return true;
      return isValidEmail(email) && password.length >= MIN_PASSWORD_LENGTH && phoneNumber.trim().length >= 7;
    }
    if (step === 2) return ville.trim().length > 0;
    if (step === 3) return latitude !== null && longitude !== null && termsAccepted && phoneNumber.trim().length >= 7;
    return false;
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      dispatch({ type: 'NEXT_STEP', googleIdToken });
    } else {
      set({ triedSubmit: true });
      if (canProceed()) handleRegister();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      dispatch({ type: 'PREV_STEP', googleIdToken });
    }
    else router.back();
  };

  // ── Geocode an address string → move the map to that location ──
  const handleAddressSearch = async () => {
    const query = addressSearch.trim();
    if (!query) return;
    set({ isGeoSearching: true });
    try {
      // Append city name to improve geocoding accuracy
      const fullQuery = ville ? `${query}, ${ville}, ${t('common.morocco')}` : `${query}, ${t('common.morocco')}`;
      const results = await geocodeAsync(fullQuery);
      if (results.length > 0) {
        const { latitude: lat, longitude: lng } = results[0];
        set({ latitude: lat, longitude: lng });
        mapRef.current?.animateToRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
        // Reverse geocode to show a readable address
        reverseGeocodeAndLabel(lat, lng);
      } else {
        Alert.alert(t('registerExtra.addressNotFound'), t('registerExtra.addressNotFoundMsg'));
      }
    } catch {
      Alert.alert(t('common.error'), t('registerExtra.addressSearchError'));
    } finally {
      set({ isGeoSearching: false });
    }
  };

  // ── Reverse geocode coords → readable address label ──
  const reverseGeocodeAndLabel = async (lat: number, lng: number) => {
    try {
      const results = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const r = results[0];
        const parts = [r.street, r.district, r.city, r.region].filter(Boolean);
        set({ addressLabel: parts.join(', ') });
      } else {
        set({ addressLabel: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
      }
    } catch {
      set({ addressLabel: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
    }
  };

  // ── Register ──
  const handleRegister = async () => {
    const businessData = {
      nom: nom.trim(),
      categorie: categorie!,
      ville: ville.trim(),
      phoneNumber: phoneNumber.trim(),
      quartier: quartier.trim() || undefined,
      adresse: addressLabel.trim() || undefined,
      latitude: latitude || undefined,
      longitude: longitude || undefined,
      termsAccepted,
      ...(referralCode.trim() && referralStatus === 'valid' && { referralCode: referralCode.trim() }),
    };

    // ── Google registration flow ──
    if (googleIdToken) {
      if (!nom || !categorie || !ville || !termsAccepted || !phoneNumber.trim()) {
        Alert.alert(t('common.error'), t('registerExtra.fillAllFields'));
        return;
      }

      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const result = await googleRegister(googleIdToken, businessData);
        if (result.success) {
          router.replace('/scan-qr');
        } else {
          Alert.alert(
            t('registerExtra.registrationError'),
            result.error || t('common.genericError'),
          );
        }
      } catch (error: unknown) {
        Alert.alert(
          t('registerExtra.registrationError'),
          getErrorMessage(error, t('common.genericError')),
        );
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
      return;
    }

    // ── Classic registration flow ──
    if (!nom || !email || !password || !categorie || !ville || !termsAccepted) {
      Alert.alert(t('common.error'), t('registerExtra.fillAllFields'));
      return;
    }

    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      await api.post('/auth/register', {
        ...businessData,
        email: email.trim().toLowerCase(),
        password,
      });
      // Redirect to email verification screen
      router.replace({
        pathname: '/verify-email',
        params: { email: email.trim().toLowerCase() },
      });
    } catch (error: unknown) {
      Alert.alert(
        t('registerExtra.registrationError'),
        getErrorMessage(error, t('common.genericError')),
      );
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  };

  // ── Filtered cities ──
  const filteredVilles = useMemo(
    () => villeSearch
      ? VILLES.filter((v) => v.toLowerCase().includes(villeSearch.toLowerCase()))
      : VILLES,
    [villeSearch],
  );

  // ── Step titles ──
  const stepTitles = [
    { title: t('registerExtra.step0'), sub: t('registerExtra.sub0') },
    { title: t('registerExtra.step1'), sub: t('registerExtra.sub1') },
    { title: t('registerExtra.step2'), sub: t('registerExtra.sub2') },
    { title: t('registerExtra.step3'), sub: t('registerExtra.sub3') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Back / Close ── */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>

          {/* ── Header ── */}
          <View style={styles.header}>
            <Text style={[styles.stepLabel, { color: theme.primary }]}>
              {t('registerExtra.stepLabel', { current: step + 1, total: TOTAL_STEPS })}
            </Text>
            <Text style={[styles.title, { color: theme.text }]}>
              {stepTitles[step].title}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {stepTitles[step].sub}
            </Text>
          </View>

          {/* ── Trial badge (show on first step) ── */}
          {step === 0 && (
            <View style={[styles.trialBadge, { backgroundColor: `${theme.primary}12`, borderColor: `${theme.primary}30` }]}>
              <Text style={[styles.trialBadgeText, { color: theme.primary }]}>
                🎁 {t('registerExtra.trialBadge')}
              </Text>
            </View>
          )}

          {/* ── Step indicator ── */}
          <StepIndicator current={step} total={TOTAL_STEPS} theme={theme} labels={stepTitles.map((s) => s.title)} />

          {/* ── Step 0: Identité du commerce ── */}
          {step === 0 && (
            <Animated.View>
              <StepIdentity
                theme={theme}
                t={t}
                nom={nom}
                setNom={(v) => set({ nom: v })}
                categorie={categorie}
                setCategorie={(v) => set({ categorie: v })}
                googleIdToken={googleIdToken}
                setGoogleIdToken={(v) => set({ googleIdToken: v })}
                google={google}
                canProceed={canProceed()}
                isLoading={isLoading}
                palette={palette}
              />
            </Animated.View>
          )}

          {/* ── Step 1: Identifiants ── */}
          {step === 1 && (
            <Animated.View>
              <StepCredentials
                theme={theme}
                t={t}
                email={email}
                setEmail={(v) => set({ email: v })}
                password={password}
                setPassword={(v) => set({ password: v })}
                phoneNumber={phoneNumber}
                setPhoneNumber={(v) => set({ phoneNumber: v })}
                showPassword={showPassword}
                setShowPassword={(v) => set({ showPassword: v })}
                emailRef={emailRef}
                phoneRef={phoneRef}
                passwordRef={passwordRef}
              />
            </Animated.View>
          )}

          {/* ── Step 2: Localisation ── */}
          {step === 2 && (
            <Animated.View>
              {/* Ville */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('registerExtra.villeLabel')} *
                </Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: ville ? theme.success : theme.border,
                    },
                  ]}
                >
                  <MapPin size={20} color={ville ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={villeSearch || ville}
                    onChangeText={(t) => {
                      set({ villeSearch: t });
                      if (!t) set({ ville: '' });
                    }}
                    placeholder={t('registerExtra.villeSearchPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    autoFocus
                  />
                  {ville ? (
                    <View style={[styles.villeSelectedBadge, { backgroundColor: theme.primaryBg }]}>
                      <Text style={[styles.villeSelectedText, { color: theme.primary }]}>
                        {ville}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* City list */}
                {!ville && (
                  <View style={[styles.villeList, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                      {filteredVilles.map((v) => (
                        <TouchableOpacity
                          key={v}
                          style={[styles.villeItem, { borderBottomColor: theme.borderLight }]}
                          onPress={() => {
                            set({ ville: v, villeSearch: '' });
                            quartierRef.current?.focus();
                          }}
                          activeOpacity={0.6}
                        >
                          <MapPin size={16} color={theme.textMuted} />
                          <Text style={[styles.villeText, { color: theme.text }]}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                      {filteredVilles.length === 0 && (
                        <TouchableOpacity
                          style={styles.villeItem}
                          onPress={() => {
                            set({ ville: villeSearch.trim(), villeSearch: '' });
                          }}
                          activeOpacity={0.6}
                        >
                          <Text style={[styles.villeText, { color: theme.primary }]}>
                            {t('registerExtra.addCity', { city: villeSearch })}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </View>
                )}

                {/* Change ville */}
                {ville ? (
                  <TouchableOpacity
                    onPress={() => {
                      set({ ville: '', villeSearch: '' });
                    }}
                  >
                    <Text style={[styles.changeLink, { color: theme.primary }]}>
                      {t('registerExtra.changeCity')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Quartier */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('registerExtra.quartierLabel')}
                </Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: quartier ? theme.success : theme.border,
                    },
                  ]}
                >
                  <MapPin size={20} color={quartier ? theme.success : theme.textMuted} />
                  <TextInput
                    ref={quartierRef}
                    style={[styles.input, { color: theme.text }]}
                    value={quartier}
                    onChangeText={(v) => set({ quartier: v })}
                    placeholder={t('registerExtra.quartierPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    returnKeyType="done"
                  />
                </View>
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  {t('registerExtra.quartierHint')}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Step 3: Position GPS + Conformité ── */}
          {step === 3 && (
            <Animated.View>
              <StepMapCompliance
                theme={theme}
                t={t}
                googleIdToken={googleIdToken}
                phoneNumber={phoneNumber}
                setPhoneNumber={(v) => set({ phoneNumber: v })}
                latitude={latitude}
                setLatitude={(v) => set({ latitude: v })}
                longitude={longitude}
                setLongitude={(v) => set({ longitude: v })}
                addressSearch={addressSearch}
                setAddressSearch={(v) => set({ addressSearch: v })}
                addressLabel={addressLabel}
                isGeoSearching={isGeoSearching}
                termsAccepted={termsAccepted}
                setTermsAccepted={(v) => set({ termsAccepted: v })}
                triedSubmit={triedSubmit}
                referralCode={referralCode}
                referralStatus={referralStatus}
                referralNom={referralNom}
                handleReferralCodeChange={handleReferralCodeChange}
                handleAddressSearch={handleAddressSearch}
                reverseGeocodeAndLabel={reverseGeocodeAndLabel}
                onAddressSelect={(result) => {
                  if (result.city) set({ ville: result.city });
                }}
                ville={ville}
                setReferralCode={(v) => set({ referralCode: v })}
                setReferralStatus={(v) => set({ referralStatus: v })}
                setReferralNom={(v) => set({ referralNom: v })}
                mapRef={mapRef}
                googleMapsApiKey={googleMapsApiKey}
              />
            </Animated.View>
          )}

          {/* ── Action buttons ── */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.mainBtn,
                {
                  backgroundColor: canProceed() ? theme.primary : theme.border,
                  opacity: canProceed() ? 1 : 0.6,
                },
              ]}
              onPress={handleNext}
              disabled={(!canProceed() && step < TOTAL_STEPS - 1) || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : step < TOTAL_STEPS - 1 ? (
                <>
                  <Text style={styles.mainBtnText}>{t('registerExtra.nextBtn')}</Text>
                  <ChevronRight size={20} color="#fff" strokeWidth={1.5} />
                </>
              ) : (
                <>
                  <Text style={styles.mainBtnText}>{t('registerExtra.finishBtn')}</Text>
                  <Check size={20} color="#fff" strokeWidth={1.5} />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                {t('register.alreadyAccount')}{' '}
                <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('register.loginLink')}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 24 },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  header: { marginBottom: 8 },
  stepLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 15, lineHeight: 22 },

  // Trial badge
  trialBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  trialBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },

  field: { marginBottom: 22 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, letterSpacing: 0.2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    gap: 10,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },

  hint: { fontSize: 12, marginTop: 6, marginLeft: 4 },

  // Ville
  villeList: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  villeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 0.5,
  },
  villeText: { fontSize: 15, fontWeight: '500' },
  villeSelectedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  villeSelectedText: { fontSize: 13, fontWeight: '700' },
  changeLink: { fontSize: 13, fontWeight: '600', marginTop: 8, marginLeft: 4 },

  // Actions
  actions: { marginTop: 12, marginBottom: 8 },
  mainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1F2937',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Footer
  footer: { alignItems: 'center', marginTop: 16, paddingBottom: 16 },
  footerText: { fontSize: 14 },

});
