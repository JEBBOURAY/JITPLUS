import React, { useState, useRef, useCallback } from 'react';
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
  Linking,
} from 'react-native';
// Reanimated removed — plain View shim
const Animated = { View } as const;
import { useRouter } from 'expo-router';
import {
  Eye,
  EyeOff,
  Store,
  Mail,
  Lock,
  Phone,
  MapPin,
  ChevronRight,
  Check,
  ArrowLeft,
  MapPinned,
  Search,
  Gift,
} from 'lucide-react-native';
import MapView, { Marker, PROVIDER_GOOGLE, SafeMapViewRef } from '@/components/SafeMapView';
import * as Location from 'expo-location';
import { geocodeAsync, reverseGeocodeAsync } from '@/utils/geocodeCache';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import { MerchantCategory } from '@/types';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { CATEGORY_LABELS } from '@/constants/categories';
import { isValidEmail } from '@/utils/validation';
import { getErrorMessage } from '@/utils/error';
import { VILLES } from '@/constants/villes';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';

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
  const [step, setStep] = useState(0);

  // Google registration state
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);

  // Form state
  const [nom, setNom] = useState('');
  const [categorie, setCategorie] = useState<MerchantCategory | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ville, setVille] = useState('');
  const [quartier, setQuartier] = useState('');
  const [villeSearch, setVilleSearch] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Referral code
  const [referralCode, setReferralCode] = useState('');
  const [referralStatus, setReferralStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');
  const [referralNom, setReferralNom] = useState('');
  const referralTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useLanguage();

  // Google ID token capture for registration
  const handleGoogleToken = useCallback((idToken: string) => {
    setGoogleIdToken(idToken);
    // Skip step 1 (credentials) — jump to step 2 (location)
    if (step <= 0) setStep(2);
  }, [step]);
  const google = useGoogleIdToken(handleGoogleToken);

  // Map address search state
  const [addressSearch, setAddressSearch] = useState('');
  const [addressLabel, setAddressLabel] = useState('');
  const [isGeoSearching, setIsGeoSearching] = useState(false);

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
    const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setReferralCode(code);
    setReferralStatus('idle');
    setReferralNom('');
    if (referralTimer.current) clearTimeout(referralTimer.current);
    if (code.length >= 6) {
      setReferralStatus('verifying');
      referralTimer.current = setTimeout(async () => {
        const result = await verifyReferralCode(code);
        if (result) {
          setReferralStatus('valid');
          setReferralNom(result.nom);
        } else {
          setReferralStatus('invalid');
        }
      }, 600);
    }
  }, []);

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
      // Google flow: skip step 1 (credentials) — go from 0 → 2
      const nextStep = (step === 0 && googleIdToken) ? 2 : step + 1;
      setStep(nextStep);
    } else {
      setTriedSubmit(true);
      if (canProceed()) handleRegister();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      // Google flow: skip step 1 when going back from step 2
      const prevStep = (step === 2 && googleIdToken) ? 0 : step - 1;
      setStep(prevStep);
    }
    else router.back();
  };

  // ── Geocode an address string → move the map to that location ──
  const handleAddressSearch = async () => {
    const query = addressSearch.trim();
    if (!query) return;
    setIsGeoSearching(true);
    try {
      // Append city name to improve geocoding accuracy
      const fullQuery = ville ? `${query}, ${ville}, Maroc` : `${query}, Maroc`;
      const results = await geocodeAsync(fullQuery);
      if (results.length > 0) {
        const { latitude: lat, longitude: lng } = results[0];
        setLatitude(lat);
        setLongitude(lng);
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
      setIsGeoSearching(false);
    }
  };

  // ── Reverse geocode coords → readable address label ──
  const reverseGeocodeAndLabel = async (lat: number, lng: number) => {
    try {
      const results = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const r = results[0];
        const parts = [r.street, r.district, r.city, r.region].filter(Boolean);
        setAddressLabel(parts.join(', '));
      } else {
        setAddressLabel(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } catch {
      setAddressLabel(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
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

      setIsLoading(true);
      try {
        const result = await googleRegister(googleIdToken, businessData);
        if (result.success) {
          router.replace('/(tabs)');
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
        setIsLoading(false);
      }
      return;
    }

    // ── Classic registration flow ──
    if (!nom || !email || !password || !categorie || !ville || !termsAccepted) {
      Alert.alert(t('common.error'), t('registerExtra.fillAllFields'));
      return;
    }

    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  // ── Filtered cities ──
  const filteredVilles = villeSearch
    ? VILLES.filter((v) => v.toLowerCase().includes(villeSearch.toLowerCase()))
    : VILLES;

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
              {/* Nom de la boutique */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('register.nameLabel')} *
                </Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: nom.trim().length > 0 ? theme.success : theme.border,
                    },
                  ]}
                >
                  <Store size={20} color={nom.trim().length > 0 ? theme.success : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={nom}
                    onChangeText={setNom}
                    placeholder={t('registerExtra.namePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    autoFocus
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Catégorie */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('register.categoryLabel')} *
                </Text>
                <View style={styles.categoryGrid}>
                  {Object.entries(CATEGORY_LABELS).map(([key, { label, emoji }]) => {
                    const isSelected = categorie === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.categoryChip,
                          {
                            backgroundColor: isSelected
                              ? theme.primaryBg
                              : theme.bgCard,
                            borderColor: isSelected ? theme.primary : theme.border,
                          },
                        ]}
                        onPress={() => setCategorie(key as MerchantCategory)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.categoryEmoji}>{emoji}</Text>
                        <Text
                          style={[
                            styles.categoryLabel,
                            {
                              color: isSelected ? theme.primary : theme.textSecondary,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {label}
                        </Text>
                        {isSelected && (
                          <Check size={14} color={theme.primary} strokeWidth={1.5} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Google Sign-Up option ── */}
              {!googleIdToken && (
                <>
                  <View style={styles.separator}>
                    <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
                    <Text style={[styles.separatorText, { color: theme.textMuted }]}>{t('login.orDivider')}</Text>
                    <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
                  </View>

                  <TouchableOpacity
                    style={[styles.googleBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                    onPress={google.promptGoogle}
                    disabled={google.isLoading || isLoading || !canProceed()}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('registerExtra.signUpWithGoogle')}
                  >
                    {google.isLoading ? (
                      <ActivityIndicator color={palette.charbon} size="small" />
                    ) : (
                      <>
                        <View style={styles.googleIconWrap}>
                          <Text style={styles.googleG}>G</Text>
                        </View>
                        <Text style={[styles.googleBtnText, { color: theme.text }]}>
                          {t('registerExtra.signUpWithGoogle')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {!!google.error && (
                    <Text style={[styles.hint, { color: theme.danger, textAlign: 'center', marginTop: 8 }]}>
                      {google.error}
                    </Text>
                  )}
                </>
              )}

              {/* Google token captured badge */}
              {googleIdToken && (
                <View style={[styles.googleBadge, { backgroundColor: `${theme.success}12`, borderColor: `${theme.success}30` }]}>
                  <Check size={16} color={theme.success} strokeWidth={2} />
                  <Text style={[styles.googleBadgeText, { color: theme.success }]}>
                    {t('registerExtra.googleLinked')}
                  </Text>
                  <TouchableOpacity onPress={() => setGoogleIdToken(null)} activeOpacity={0.7}>
                    <Text style={[styles.googleBadgeReset, { color: theme.textMuted }]}>
                      {t('registerExtra.googleChange')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          )}

          {/* ── Step 1: Identifiants ── */}
          {step === 1 && (
            <Animated.View>
              {/* Email */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('register.emailLabel')} *
                </Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: email && isValidEmail(email) ? theme.success : email.length > 3 && !isValidEmail(email) ? theme.danger : email ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Mail size={20} color={email && isValidEmail(email) ? theme.success : theme.textMuted} />
                  <TextInput
                    ref={emailRef}
                    style={[styles.input, { color: theme.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('register.emailPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={() => phoneRef.current?.focus()}
                  />
                  {email && isValidEmail(email) && (
                    <Check size={18} color={theme.success} strokeWidth={2.5} />
                  )}
                </View>
                {email.length > 3 && !isValidEmail(email) && (
                  <Text style={[styles.hint, { color: theme.danger }]}>
                    {t('login.invalidEmail')}
                  </Text>
                )}
                {email && isValidEmail(email) && (
                  <Text style={[styles.hint, { color: theme.success }]}>
                    {t('registerExtra.emailValid')}
                  </Text>
                )}
                {!email && (
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    {t('registerExtra.emailHint')}
                  </Text>
                )}
              </View>

              {/* Téléphone */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('registerExtra.phoneLabel')} *
                </Text>
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
                    ref={phoneRef}
                    style={[styles.input, { color: theme.text }]}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder={t('registerExtra.phonePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                  {phoneNumber.trim().length >= 7 && (
                    <Check size={18} color={theme.success} strokeWidth={2.5} />
                  )}
                </View>
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  {t('registerExtra.phoneHint')}
                </Text>
              </View>

              {/* Password */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('register.passwordLabel')} *
                </Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor:
                        password.length === 0
                          ? theme.border
                          : password.length >= MIN_PASSWORD_LENGTH
                            ? theme.success
                            : theme.danger,
                    },
                  ]}
                >
                  <Lock
                    size={20}
                    color={password.length >= MIN_PASSWORD_LENGTH ? theme.success : theme.textMuted}
                  />
                  <TextInput
                    ref={passwordRef}
                    style={[styles.input, { color: theme.text }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('registerExtra.passwordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={theme.textMuted} />
                    ) : (
                      <Eye size={20} color={theme.textMuted} />
                    )}
                  </TouchableOpacity>
                  {password.length >= MIN_PASSWORD_LENGTH && (
                    <Check size={18} color={theme.success} style={{ marginLeft: 4 }} />
                  )}
                </View>
                {/* Strength bar + hint */}
                {password.length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: theme.border,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.min((password.length / MIN_PASSWORD_LENGTH) * 100, 100)}%`,
                          height: '100%',
                          borderRadius: 2,
                          backgroundColor:
                            password.length >= MIN_PASSWORD_LENGTH ? theme.success : theme.danger,
                        }}
                      />
                    </View>
                    <Text
                      style={[
                        styles.hint,
                        {
                          color:
                            password.length >= MIN_PASSWORD_LENGTH ? theme.success : theme.danger,
                          marginTop: 4,
                        },
                      ]}
                    >
                      {password.length < MIN_PASSWORD_LENGTH
                        ? t('registerExtra.passwordTooShort', {
                            count: MIN_PASSWORD_LENGTH - password.length,
                          })
                        : t('registerExtra.passwordValid')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Secure note */}
              <View style={[styles.secureNote, { backgroundColor: `${theme.success}08` }]}>
                <Text style={[styles.secureNoteText, { color: theme.textMuted }]}>
                  {t('registerExtra.secureNote')}
                </Text>
              </View>
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
                      setVilleSearch(t);
                      if (!t) setVille('');
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
                            setVille(v);
                            setVilleSearch('');
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
                            setVille(villeSearch.trim());
                            setVilleSearch('');
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
                      setVille('');
                      setVilleSearch('');
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
                    onChangeText={setQuartier}
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
              {/* Google Maps */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('registerExtra.mapTitle')}
                </Text>
                <Text style={[styles.hint, { color: theme.textMuted, marginBottom: 10 }]}>
                  {t('registerExtra.mapHint')}
                </Text>

                {/* ── Address search bar ── */}
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: addressSearch ? theme.primary : theme.border,
                      marginBottom: 10,
                    },
                  ]}
                >
                  <Search size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={addressSearch}
                    onChangeText={setAddressSearch}
                    placeholder={t('registerExtra.addressPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    returnKeyType="search"
                    onSubmitEditing={handleAddressSearch}
                    autoFocus
                  />
                  {isGeoSearching ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <TouchableOpacity
                      onPress={handleAddressSearch}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MapPin size={20} color={theme.primary} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.mapContainer}>
                  <MapView
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
                  </MapView>

                  {/* Get current location button */}
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

                {/* Address label from reverse geocoding */}
                {latitude && longitude && (
                  <View style={{ marginTop: 8 }}>
                    {addressLabel ? (
                      <Text style={[styles.hint, { color: theme.success }]}>
                        📍 {addressLabel}
                      </Text>
                    ) : (
                      <Text style={[styles.hint, { color: theme.success }]}>
                        {t('registerExtra.positionLabel', { lat: latitude.toFixed(6), lng: longitude.toFixed(6) })}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {/* Phone number — shown here for Google users who skip step 1 */}
              {googleIdToken && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    {t('registerExtra.phoneLabel')} *
                  </Text>
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
                    {phoneNumber.trim().length >= 7 && (
                      <Check size={18} color={theme.success} strokeWidth={2.5} />
                    )}
                  </View>
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    {t('registerExtra.phoneHint')}
                  </Text>
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
                        onPress={() => Linking.openURL('https://jitplus.com/cgu')}
                      >
                        {t('register.termsLink')}
                      </Text>
                      {' '}{t('registerExtra.and')}{' '}
                      <Text
                        style={{ color: theme.primary, fontWeight: '700', textDecorationLine: 'underline' }}
                        onPress={() => Linking.openURL('https://jitplus.com/privacy')}
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

              {/* ── Referral code (optional) ── */}
              <View style={[styles.field, { marginTop: 4 }]}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {t('referral.referralCodeLabel')}
                </Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor:
                        referralStatus === 'valid'
                          ? theme.success
                          : referralStatus === 'invalid'
                          ? theme.danger
                          : referralCode
                          ? theme.primary
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
                  {referralStatus === 'verifying' && (
                    <ActivityIndicator size="small" color={theme.primary} />
                  )}
                </View>

                {/* ── Referral feedback ── */}
                {referralStatus === 'valid' && (
                  <View style={[styles.referralCard, { backgroundColor: `${theme.success}15`, borderColor: `${theme.success}40` }]}>
                    <Gift size={20} color={theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.referralCardLabel, { color: theme.success }]}>
                        {t('referral.referralCodeSponsoredBy')}
                      </Text>
                      <Text style={[styles.referralCardName, { color: theme.text }]}>
                        {referralNom}
                      </Text>
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
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    {t('registerExtra.referralHint')}
                  </Text>
                )}
              </View>
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

  // Secure note
  secureNote: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  secureNoteText: {
    fontSize: 12,
    textAlign: 'center',
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

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 6,
  },
  categoryEmoji: { fontSize: 18 },
  categoryLabel: { fontSize: 13 },

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

  // Map
  mapContainer: {
    height: 280,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  locationBtn: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#1F2937',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  locationBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  termsText: {
    fontSize: 14,
    lineHeight: 20,
  },

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

  // Referral feedback cards
  referralCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  referralCardLabel: {
    fontSize: 12,
    fontFamily: 'Lexend_500Medium',
    marginBottom: 2,
  },
  referralCardName: {
    fontSize: 16,
    fontFamily: 'Lexend_700Bold',
  },
  referralClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  referralClearBtnText: {
    fontSize: 12,
    fontFamily: 'Lexend_600SemiBold',
  },

  // Footer
  footer: { alignItems: 'center', marginTop: 16, paddingBottom: 16 },
  footerText: { fontSize: 14 },

  // Google sign-up
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  separatorLine: {
    flex: 1,
    height: 1,
  },
  separatorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 10,
  },
  googleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  googleG: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  googleBadgeReset: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
