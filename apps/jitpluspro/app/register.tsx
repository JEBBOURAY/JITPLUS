import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  LayoutAnimation,
  UIManager,
  Modal,
  Pressable,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Check,
  ArrowLeft,
  ArrowRight,
  LogIn,
  Store,
  Phone,
  Mail,
  Gift,
  ChevronDown,
  ShieldCheck,
  MapPin,
  Navigation,
  Tag,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import api from '@/services/api';
import { isValidPassword } from '@/utils/passwordStrength';
import { isValidEmail } from '@/utils/validation';
import { getErrorMessage } from '@/utils/error';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import { useAppleIdToken } from '@/hooks/useAppleIdToken';
import { StepPassword } from '@/components/register/StepPassword';
import { AppleLogo } from '@/components/AppleLogo';
import BrandName from '@/components/BrandName';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import SafeMapView, { Marker, type SafeMapViewRef } from '@/components/SafeMapView';
import { reverseGeocodeAsync } from '@/utils/geocodeCache';
import { getCategoryOptions, getCategoryLabel } from '@/constants/categories';
import type { MerchantCategory } from '@/types';
import * as Location from 'expo-location';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

// Enable LayoutAnimation on Android (referral collapsible)
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  typeof (global as Record<string, unknown>).nativeFabricUIManager === 'undefined'
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STORE_NAME_MAX = 100;

type ReferralStatus = 'idle' | 'checking' | 'valid' | 'invalid';

// ── Main ────────────────────────────────────────────────────────
export default function RegisterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { googleRegister, appleRegister, register: authRegister, signIn } = useAuth();
  const { t } = useLanguage();

  // ── Form state ──
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [appleIdentityToken, setAppleIdentityToken] = useState<string | null>(null);
  const [appleGivenName, setAppleGivenName] = useState<string | undefined>(undefined);
  const [appleFamilyName, setAppleFamilyName] = useState<string | undefined>(undefined);
  const [appleRawNonce, setAppleRawNonce] = useState<string | null>(null);

  const [nomCommerce, setNomCommerce] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+212');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Business category + location (same UX as store management)
  const [categorie, setCategorie] = useState<MerchantCategory | ''>('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [ville, setVille] = useState('');
  const [quartier, setQuartier] = useState('');
  const [adresse, setAdresse] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const [referralOpen, setReferralOpen] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>('idle');
  const [referralName, setReferralName] = useState('');

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stepError, setStepError] = useState('');
  const [emailChecking, setEmailChecking] = useState(false);
  const [phoneChecking, setPhoneChecking] = useState(false);

  const isSocialAuth = !!googleIdToken || !!appleIdentityToken;

  // Hard re-entrancy guard for submit (double-tap safety).
  const submittingRef = useRef(false);
  const isMountedRef = useRef(true);
  const referralRequestIdRef = useRef(0);

  // ── Refs ──
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const referralDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<SafeMapViewRef>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // ── Social token capture ──
  const handleGoogleToken = useCallback((idToken: string) => {
    setStepError('');
    setGoogleIdToken(idToken);
    setAppleIdentityToken(null);
  }, []);
  const google = useGoogleIdToken(handleGoogleToken);

  const handleAppleToken = useCallback(
    (data: { identityToken: string; givenName?: string; familyName?: string; rawNonce: string }) => {
      setStepError('');
      setAppleIdentityToken(data.identityToken);
      if (data.givenName !== undefined) setAppleGivenName(data.givenName);
      if (data.familyName !== undefined) setAppleFamilyName(data.familyName);
      setAppleRawNonce(data.rawNonce);
      setGoogleIdToken(null);
    },
    [],
  );
  const apple = useAppleIdToken(handleAppleToken);

  // ── Entrance animations ──
  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const footerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.stagger(120, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
      Animated.timing(footerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (referralDebounceRef.current) clearTimeout(referralDebounceRef.current);
      referralRequestIdRef.current += 1;
    };
  }, []);

  // ── Referral live validation (debounced) ──
  const checkReferralCode = useCallback((code: string) => {
    if (referralDebounceRef.current) clearTimeout(referralDebounceRef.current);
    const trimmed = code.trim().toUpperCase();
    const requestId = referralRequestIdRef.current + 1;
    referralRequestIdRef.current = requestId;
    if (!trimmed || trimmed.length < 4) {
      setReferralStatus('idle');
      setReferralName('');
      return;
    }
    setReferralStatus('checking');
    referralDebounceRef.current = setTimeout(async () => {
      try {
        const { data: result } = await api.get(`/auth/referral/check/${encodeURIComponent(trimmed)}`);
        if (!isMountedRef.current || referralRequestIdRef.current !== requestId) return;
        setReferralStatus('valid');
        setReferralName(result.nom || result.name || '');
      } catch {
        if (!isMountedRef.current || referralRequestIdRef.current !== requestId) return;
        setReferralStatus('invalid');
        setReferralName('');
      }
    }, 600);
  }, []);

  const handleReferralChange = useCallback(
    (v: string) => {
      setReferralCode(v);
      checkReferralCode(v);
    },
    [checkReferralCode],
  );

  const toggleReferral = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReferralOpen((o) => !o);
  }, []);

  // ── Email uniqueness check (on blur) ──
  const handleEmailBlur = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !isValidEmail(trimmed)) return;
    setEmailChecking(true);
    try {
      const { data } = await api.post('/auth/check-email', { email: trimmed });
      if (data.exists) {
        setStepError(t('registerExtra.emailAlreadyUsed'));
      } else if (stepError === t('registerExtra.emailAlreadyUsed')) {
        setStepError('');
      }
    } catch {
      // Silent — final check happens server-side on submit.
    } finally {
      setEmailChecking(false);
    }
  }, [email, stepError, t]);

  // ── Validation ──
  const normalizedPhone = useMemo(() => {
    const raw = phoneNumber.trim();
    if (!raw) return '';

    const compact = raw.replace(/\s+/g, '');

    // Keep explicit international format as entered by user.
    if (compact.startsWith('+')) {
      const digits = compact.slice(1).replace(/\D/g, '');
      return digits ? `+${digits}` : '';
    }

    const digits = compact.replace(/\D/g, '');
    if (!digits) return '';

    // Morocco is the default country when no '+' prefix is provided.
    if (digits.startsWith('0')) return `+212${digits.slice(1)}`;
    if (digits.startsWith('212')) return `+${digits}`;
    return `+212${digits}`;
  }, [phoneNumber]);
  const phoneValid = useMemo(() => /^\+?[0-9]{8,15}$/.test(normalizedPhone), [normalizedPhone]);
  const storeNameValid = nomCommerce.trim().length > 0;
  const emailValid = isValidEmail(email);
  const passwordOk = isValidPassword(password) && password === confirmPassword;

  // ── Phone uniqueness check (on blur) ──
  const handlePhoneBlur = useCallback(async () => {
    if (normalizedPhone && phoneNumber.trim() !== normalizedPhone) {
      setPhoneNumber(normalizedPhone);
    }
    if (!phoneValid) return;
    setPhoneChecking(true);
    try {
      const { data } = await api.post('/auth/check-phone', { phoneNumber: normalizedPhone });
      if (data.exists) {
        setStepError(t('registerExtra.phoneAlreadyUsed'));
      } else if (stepError === t('registerExtra.phoneAlreadyUsed')) {
        setStepError('');
      }
    } catch {
      // Silent — final check happens server-side on submit.
    } finally {
      setPhoneChecking(false);
    }
  }, [normalizedPhone, phoneNumber, phoneValid, stepError, t]);

  const canSubmit = useMemo(() => {
    if (!storeNameValid || !termsAccepted || !phoneValid) return false;
    if (isSocialAuth) return true;
    return emailValid && passwordOk;
  }, [storeNameValid, termsAccepted, phoneValid, isSocialAuth, emailValid, passwordOk]);

  const resetChecklistStateForNewAccount = useCallback(async () => {
    await AsyncStorage.multiRemove([
      ASYNC_STORAGE_KEYS.CHECKLIST_DISMISSED,
      ASYNC_STORAGE_KEYS.CHECKLIST_LOYALTY_CONFIRMED,
      ASYNC_STORAGE_KEYS.CHECKLIST_SCANNED,
      ASYNC_STORAGE_KEYS.CHECKLIST_COLLAPSED,
      ASYNC_STORAGE_KEYS.CHECKLIST_HIDDEN,
      ASYNC_STORAGE_KEYS.CHECKLIST_HIDE_NOTICE_SEEN,
    ]).catch(() => {});
  }, []);

  // ── Category + location (mirrors the store management screen) ──
  const handleCategoryPick = useCallback((value: MerchantCategory) => {
    setCategorie(value);
    setShowCategoryPicker(false);
  }, []);

  const reverseGeocodeAndLabel = useCallback(async (lat: number, lng: number) => {
    try {
      const results = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const g = results[0];
        const parts = [g.street, g.name, g.district, g.subregion].filter(Boolean);
        if (parts.length) setAdresse(parts.join(', '));
        if (g.city) setVille(g.city);
        if (g.district) setQuartier(g.district);
      }
    } catch {
      // ignore reverse geocode failures
    }
  }, []);

  const handleUseMyLocation = useCallback(async () => {
    Keyboard.dismiss();
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
      const { latitude: lat, longitude: lng } = loc.coords;
      userLocationRef.current = { latitude: lat, longitude: lng };
      setLatitude(lat);
      setLongitude(lng);
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.045, longitudeDelta: 0.045 });
      await reverseGeocodeAndLabel(lat, lng);
    } catch {
      Alert.alert(t('common.error'), t('stores.locationError'));
    } finally {
      setLocating(false);
    }
  }, [reverseGeocodeAndLabel, t]);

  const defaultRegion = useMemo(() => ({
    latitude: latitude ?? userLocationRef.current?.latitude ?? 33.5731,
    longitude: longitude ?? userLocationRef.current?.longitude ?? -7.5898,
    latitudeDelta: 0.045,
    longitudeDelta: 0.045,
  }), [latitude, longitude]);

  // ── Register ──
  const handleRegister = useCallback(async () => {
    if (submittingRef.current) return;
    if (!canSubmit) return;
    Keyboard.dismiss();
    submittingRef.current = true;
    setStepError('');

    const trimmedReferral = referralCode.trim();
    const storeData = {
      nomCommerce: nomCommerce.trim(),
      phoneNumber: normalizedPhone,
      ...(categorie && { categorie }),
      ...(ville.trim() && { ville: ville.trim() }),
      ...(quartier.trim() && { quartier: quartier.trim() }),
      ...(adresse.trim() && { adresse: adresse.trim() }),
      ...(latitude != null && longitude != null && { latitude, longitude }),
      ...(trimmedReferral && { referralCode: trimmedReferral }),
    };

    setIsLoading(true);
    try {
      if (googleIdToken) {
        const result = await googleRegister(googleIdToken, { ...storeData, termsAccepted });
        if (result.success) {
          await resetChecklistStateForNewAccount();
          router.replace('/(tabs)/activity');
        } else {
          Alert.alert(
            t('registerExtra.registrationError'),
            result.error || t('registerExtra.registrationErrorMsg'),
          );
        }
        return;
      }

      if (appleIdentityToken) {
        const result = await appleRegister(
          appleIdentityToken,
          appleGivenName,
          appleFamilyName,
          { ...storeData, termsAccepted },
          appleRawNonce ?? undefined,
        );
        if (result.success) {
          await resetChecklistStateForNewAccount();
          router.replace('/(tabs)/activity');
        } else {
          Alert.alert(
            t('registerExtra.registrationError'),
            result.error || t('registerExtra.registrationErrorMsg'),
          );
        }
        return;
      }

      // Email flow — create the account (pre-verified), then auto-login.
      await authRegister({
        email: email.trim().toLowerCase(),
        password,
        ...storeData,
        termsAccepted,
      });
      // The account exists from here on. A later sign-in failure must NOT surface
      // as "registration failed" (the user would retry and hit a 409 on the now
      // existing email). Retry the auto-login once, then fall back to the login
      // screen so the user is never stuck.
      await resetChecklistStateForNewAccount();
      const creds = { email: email.trim().toLowerCase(), password };
      try {
        await signIn(creds, true);
        router.replace('/(tabs)/activity');
      } catch {
        try {
          await signIn(creds, true);
          router.replace('/(tabs)/activity');
        } catch {
          Alert.alert(t('registerExtra.welcomeTitle'), t('registerExtra.welcomeMsg', { nom: nomCommerce.trim() }));
          router.replace('/login');
        }
      }
      return;
    } catch (error: unknown) {
      const ax = error as { isAxiosError?: boolean; code?: string; response?: unknown };
      const isNetwork =
        ax?.isAxiosError && (ax?.code === 'ECONNABORTED' || ax?.code === 'ERR_NETWORK' || !ax?.response);
      Alert.alert(
        isNetwork ? t('common.networkError') : t('registerExtra.registrationError'),
        isNetwork ? t('common.networkErrorMsg') : getErrorMessage(error, t('registerExtra.registrationErrorMsg')),
      );
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  }, [
    canSubmit,
    referralCode,
    nomCommerce,
    normalizedPhone,
    categorie,
    ville,
    quartier,
    adresse,
    latitude,
    longitude,
    googleIdToken,
    appleIdentityToken,
    appleGivenName,
    appleFamilyName,
    appleRawNonce,
    email,
    password,
    termsAccepted,
    googleRegister,
    appleRegister,
    authRegister,
    signIn,
    resetChecklistStateForNewAccount,
    router,
    t,
  ]);

  const resetSocial = useCallback(() => {
    setGoogleIdToken(null);
    setAppleIdentityToken(null);
    setAppleGivenName(undefined);
    setAppleFamilyName(undefined);
    setAppleRawNonce(null);
  }, []);

  const handleBack = useCallback(() => router.back(), [router]);

  const socialProvider = googleIdToken ? 'google' : appleIdentityToken ? 'apple' : null;

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Header ── */}
            <Animated.View
              style={{
                opacity: headerAnim,
                transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
              }}
            >
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: `${theme.text}08` }]}
                onPress={handleBack}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ArrowLeft size={ms(20)} color={theme.text} strokeWidth={1.5} />
              </TouchableOpacity>

              <View style={styles.brandHeader}>
                <Image
                  source={require('@/assets/images/jitplusprologo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
                <BrandName fontSize={24} />
              </View>

              <View style={styles.titleWrap}>
                <Text style={[styles.title, { color: theme.text }]}>{t('register.title')}</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t('register.subtitle')}</Text>
                <View style={[styles.trialBadge, { backgroundColor: `${palette.violet}10`, borderColor: `${palette.violet}30` }]}>
                  <Gift size={ms(15)} color={palette.violet} />
                  <Text style={[styles.trialBadgeText, { color: palette.violet }]}>{t('registerExtra.trialBadge')}</Text>
                </View>
              </View>
            </Animated.View>

            {/* ── Body ── */}
            <Animated.View
              style={[
                styles.body,
                {
                  opacity: cardAnim,
                  transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
                },
              ]}
            >
              {/* Social sign-up buttons (email flow, before a provider is linked) */}
              {!isSocialAuth && (
                <>
                  <TouchableOpacity
                    style={[styles.socialBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                    onPress={google.promptGoogle}
                    disabled={google.isLoading || isLoading}
                    activeOpacity={0.8}
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
                        <Text style={[styles.socialBtnText, { color: theme.text }]}>
                          {t('registerExtra.signUpWithGoogle')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {!!google.error && (
                    <Text style={[styles.errorHint, { color: theme.danger }]}>{google.error}</Text>
                  )}

                  {apple?.isAvailable && (
                    <TouchableOpacity
                      style={[styles.socialBtn, { backgroundColor: '#000', borderColor: '#000', marginTop: hp(8) }]}
                      onPress={apple.promptApple}
                      disabled={apple.isLoading || isLoading}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t('registerExtra.signUpWithApple')}
                    >
                      {apple.isLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <AppleLogo size={ms(20)} color="#fff" />
                          <Text style={[styles.socialBtnText, { color: '#fff' }]}>
                            {t('registerExtra.signUpWithApple')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  {!!apple?.error && (
                    <Text style={[styles.errorHint, { color: theme.danger }]}>{apple.error}</Text>
                  )}

                  <View style={styles.separator}>
                    <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
                    <Text style={[styles.separatorText, { color: theme.textMuted }]}>{t('login.orDivider')}</Text>
                    <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
                  </View>
                </>
              )}

              {/* Linked account card (social flow) */}
              {isSocialAuth && (
                <View
                  style={[
                    styles.linkedCard,
                    { backgroundColor: `${theme.success}10`, borderColor: `${theme.success}30` },
                  ]}
                >
                  <View style={styles.linkedAvatar}>
                    {socialProvider === 'apple' ? (
                      <AppleLogo size={ms(18)} color="#fff" />
                    ) : (
                      <Text style={styles.googleG}>G</Text>
                    )}
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[styles.linkedTitle, { color: theme.text }]}>
                      {socialProvider === 'apple'
                        ? t('registerExtra.appleLinked')
                        : t('registerExtra.googleLinked')}
                    </Text>
                    <Text style={[styles.linkedSub, { color: theme.success }]}>
                      {t('registerExtra.noEmailVerifNeeded')}
                    </Text>
                  </View>
                  <View style={styles.linkedCheck}>
                    <Check size={ms(16)} color={theme.success} strokeWidth={2.5} />
                  </View>
                  <TouchableOpacity onPress={resetSocial} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.linkedReset, { color: theme.textMuted }]}>
                      {socialProvider === 'apple'
                        ? t('registerExtra.appleChange')
                        : t('registerExtra.googleChange')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Store name (required, always) */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>{t('register.nameLabel')} *</Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: storeNameValid ? palette.charbon : theme.border,
                      borderWidth: storeNameValid ? 2 : 1.5,
                    },
                  ]}
                >
                  <Store size={ms(18)} color={storeNameValid ? palette.charbon : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={nomCommerce}
                    onChangeText={setNomCommerce}
                    placeholder={t('register.namePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    maxLength={STORE_NAME_MAX}
                    editable={!isLoading}
                    autoFocus={isSocialAuth}
                    returnKeyType={isSocialAuth ? 'done' : 'next'}
                    onSubmitEditing={() => !isSocialAuth && emailRef.current?.focus()}
                  />
                  {storeNameValid && <Check size={ms(16)} color={palette.charbon} strokeWidth={2.5} />}
                </View>
              </View>

              {/* Business category */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>{t('register.categoryLabel')}</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => { Keyboard.dismiss(); setShowCategoryPicker(true); }}
                  disabled={isLoading}
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: categorie ? palette.charbon : theme.border,
                      borderWidth: categorie ? 2 : 1.5,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  {categorie ? (
                    <MerchantCategoryIcon category={categorie} size={ms(20)} />
                  ) : (
                    <Tag size={ms(18)} color={theme.textMuted} />
                  )}
                  <Text
                    style={[styles.input, { color: categorie ? theme.text : theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {categorie ? getCategoryLabel(categorie) : t('register.categoryPlaceholder')}
                  </Text>
                  <ChevronDown size={ms(18)} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Phone number (required, always) */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>{t('registerExtra.phoneLabel')} *</Text>
                <View
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.bgInput,
                      borderColor: phoneNumber && phoneValid ? palette.charbon : phoneNumber && !phoneValid ? theme.danger : theme.border,
                      borderWidth: phoneNumber && phoneValid ? 2 : 1.5,
                    },
                  ]}
                >
                  <Phone size={ms(18)} color={phoneValid ? palette.charbon : theme.textMuted} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    onBlur={handlePhoneBlur}
                    placeholder={t('registerExtra.phonePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    editable={!isLoading}
                    returnKeyType={isSocialAuth ? 'done' : 'next'}
                    onSubmitEditing={() => !isSocialAuth && emailRef.current?.focus()}
                  />
                  {phoneChecking ? (
                    <ActivityIndicator size="small" color={palette.charbon} />
                  ) : (
                    phoneValid && <Check size={ms(16)} color={palette.charbon} strokeWidth={2.5} />
                  )}
                </View>
                {phoneNumber.length > 0 && !phoneValid && (
                  <Text style={[styles.errorHint, { color: theme.danger }]}>{t('registerExtra.invalidPhoneNumber')}</Text>
                )}
              </View>

              {/* Email + password (email flow only) */}
              {!isSocialAuth && (
                <>
                  <View style={styles.field}>
                    <Text style={[styles.label, { color: theme.text }]}>{t('register.emailLabel')} *</Text>
                    <View
                      style={[
                        styles.inputRow,
                        {
                          backgroundColor: theme.bgInput,
                          borderColor: email && emailValid ? palette.charbon : email && !emailValid ? theme.danger : theme.border,
                          borderWidth: email && emailValid ? 2 : 1.5,
                        },
                      ]}
                    >
                      <Mail size={ms(18)} color={emailValid ? palette.charbon : theme.textMuted} />
                      <TextInput
                        ref={emailRef}
                        style={[styles.input, { color: theme.text }]}
                        value={email}
                        onChangeText={setEmail}
                        onBlur={handleEmailBlur}
                        placeholder={t('register.emailPlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        editable={!isLoading}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                      />
                      {emailChecking ? (
                        <ActivityIndicator size="small" color={palette.charbon} />
                      ) : (
                        emailValid && <Check size={ms(16)} color={palette.charbon} strokeWidth={2.5} />
                      )}
                    </View>
                    {email.length > 3 && !emailValid && (
                      <Text style={[styles.errorHint, { color: theme.danger }]}>{t('login.invalidEmail')}</Text>
                    )}
                  </View>

                  <StepPassword
                    theme={theme}
                    t={t}
                    password={password}
                    setPassword={setPassword}
                    confirmPassword={confirmPassword}
                    setConfirmPassword={setConfirmPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    passwordRef={passwordRef}
                    confirmRef={confirmRef}
                    isLoading={isLoading}
                  />
                </>
              )}

              {/* Location (locate me / point on the map) */}
              <View style={styles.field}>
                <View style={styles.locationLabelRow}>
                  <MapPin size={ms(15)} color={theme.text} strokeWidth={2} />
                  <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>{t('registerExtra.mapTitle')}</Text>
                </View>
                <TouchableOpacity
                  onPress={handleUseMyLocation}
                  disabled={isLoading || locating}
                  activeOpacity={0.8}
                  style={[styles.locateBtn, { backgroundColor: `${palette.charbon}0D`, borderColor: `${palette.charbon}28` }]}
                  accessibilityRole="button"
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={palette.charbon} />
                  ) : (
                    <Navigation size={ms(16)} color={palette.charbon} strokeWidth={2} />
                  )}
                  <Text style={[styles.locateBtnText, { color: palette.charbon }]}>{t('registerExtra.locateMe')}</Text>
                </TouchableOpacity>

                <View style={styles.mapWrapper}>
                  <SafeMapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={defaultRegion}
                    onPress={(event) => {
                      const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
                      setLatitude(lat);
                      setLongitude(lng);
                      void reverseGeocodeAndLabel(lat, lng);
                    }}
                    showsUserLocation={false}
                    zoomEnabled
                    scrollEnabled
                    pitchEnabled={false}
                    rotateEnabled={false}
                    showsPointsOfInterest={false}
                    showsBuildings={false}
                  >
                    {latitude != null && longitude != null ? (
                      <Marker
                        draggable
                        coordinate={{ latitude, longitude }}
                        pinColor={palette.violet}
                        onDragEnd={(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
                          const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
                          setLatitude(lat);
                          setLongitude(lng);
                          void reverseGeocodeAndLabel(lat, lng);
                        }}
                      />
                    ) : null}
                  </SafeMapView>
                </View>
                <Text style={[styles.mapHint, { color: theme.textMuted }]}>{t('registerExtra.mapHint')}</Text>
                {latitude != null && longitude != null ? (
                  <View style={[styles.gpsIndicator, { backgroundColor: `${palette.charbon}0D` }]}>
                    <Check size={ms(14)} color={palette.charbon} strokeWidth={2.5} />
                    <Text style={[styles.gpsIndicatorText, { color: palette.charbon }]} numberOfLines={1}>
                      {adresse || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Collapsible referral code */}
              <TouchableOpacity
                style={styles.referralToggle}
                onPress={toggleReferral}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: referralOpen }}
              >
                <Gift size={ms(16)} color={theme.textSecondary} />
                <Text style={[styles.referralToggleText, { color: theme.textSecondary }]}>
                  {t('registerExtra.referralToggle')}
                </Text>
                <ChevronDown
                  size={ms(18)}
                  color={theme.textMuted}
                  style={{ transform: [{ rotate: referralOpen ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {referralOpen && (
                <View style={styles.field}>
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
                            : referralCode.trim()
                            ? palette.charbon
                            : theme.border,
                        borderWidth: referralCode.trim() ? 2 : 1.5,
                      },
                    ]}
                  >
                    <Gift
                      size={ms(18)}
                      color={
                        referralStatus === 'valid'
                          ? theme.success
                          : referralStatus === 'invalid'
                          ? theme.danger
                          : referralCode.trim()
                          ? palette.charbon
                          : theme.textMuted
                      }
                    />
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={referralCode}
                      onChangeText={handleReferralChange}
                      placeholder={t('referral.referralCodePlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={20}
                      editable={!isLoading}
                    />
                    {referralStatus === 'checking' && <ActivityIndicator size="small" color={palette.charbon} />}
                  </View>
                  {referralStatus === 'valid' && (
                    <Text style={[styles.referralFeedback, { color: theme.success }]}>
                      {t('referral.referralCodeValid', { nom: referralName })}
                    </Text>
                  )}
                  {referralStatus === 'invalid' && (
                    <Text style={[styles.referralFeedback, { color: theme.danger }]}>
                      {t('referral.referralCodeInvalid')}
                    </Text>
                  )}
                </View>
              )}

              {/* Terms */}
              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => setTermsAccepted((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: termsAccepted ? theme.primary : theme.border,
                      backgroundColor: termsAccepted ? theme.primary : 'transparent',
                    },
                  ]}
                >
                  {termsAccepted && <Check size={ms(14)} color="#fff" strokeWidth={2.5} />}
                </View>
                <Text style={[styles.termsText, { color: theme.textSecondary }]}>
                  {t('registerExtra.termsText')}{' '}
                  <Text style={{ color: theme.primary, fontWeight: '600' }} onPress={() => router.push('/legal')}>
                    {t('registerExtra.termsLink')}
                  </Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* ── Step error ── */}
            {!!stepError && (
              <View
                style={[
                  styles.stepErrorBanner,
                  { backgroundColor: `${theme.danger}12`, borderColor: `${theme.danger}30` },
                ]}
              >
                <Text style={[styles.stepErrorText, { color: theme.danger }]}>{stepError}</Text>
              </View>
            )}

            {/* ── Submit ── */}
            <Animated.View style={[styles.actions, { opacity: footerAnim }]}>
              {isSocialAuth && (
                <View style={styles.noVerifRow}>
                  <ShieldCheck size={ms(15)} color={theme.success} />
                  <Text style={[styles.noVerifText, { color: theme.textMuted }]}>
                    {t('registerExtra.noEmailVerifNeeded')}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.mainBtn, { backgroundColor: canSubmit ? palette.charbon : `${palette.charbon}30` }]}
                onPress={handleRegister}
                disabled={!canSubmit || isLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('registerExtra.finishBtn')}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={[styles.mainBtnText, { opacity: canSubmit ? 1 : 0.5 }]}>
                      {t('registerExtra.finishBtn')}
                    </Text>
                    <Check size={ms(18)} color={canSubmit ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* ── Already have account ── */}
            <Animated.View style={[styles.footer, { opacity: footerAnim }]}>
              <TouchableOpacity
                onPress={() => router.push('/login')}
                activeOpacity={0.8}
                style={[styles.loginPromptBtn, { backgroundColor: `${palette.charbon}06`, borderColor: `${palette.charbon}18` }]}
              >
                <View style={[styles.loginIconWrap, { backgroundColor: palette.charbon }]}>
                  <LogIn size={ms(16)} color="#fff" strokeWidth={1.5} />
                </View>
                <View style={styles.flex1}>
                  <Text style={[styles.loginPromptTitle, { color: theme.text }]}>
                    {t('register.alreadyAccount')}
                  </Text>
                  <Text style={[styles.loginPromptSub, { color: palette.charbon }]}>{t('register.loginLink')}</Text>
                </View>
                <ArrowRight size={ms(16)} color={palette.charbon} strokeWidth={2} />
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowCategoryPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: theme.bgCard }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>{t('register.categoryLabel')}</Text>
            <ScrollView style={{ maxHeight: hp(360) }}>
              {getCategoryOptions().map((option) => {
                const selected = categorie === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => handleCategoryPick(option.value)}
                    style={[styles.categoryRow, selected && { backgroundColor: `${palette.violet}10` }]}
                  >
                    <MerchantCategoryIcon category={option.value} size={ms(20)} />
                    <Text style={[styles.categoryRowText, { color: theme.text }]}>{option.label}</Text>
                    {selected ? <Check size={ms(16)} color={palette.violet} strokeWidth={2.5} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setShowCategoryPicker(false)}
              style={[styles.closePickerBtn, { backgroundColor: theme.bgElevated }]}
            >
              <Text style={{ color: theme.textMuted, fontFamily: 'Lexend_600SemiBold' }}>{t('common.close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex1: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: wp(20),
    paddingTop: hp(2),
    paddingBottom: hp(6),
  },

  backBtn: {
    width: ms(32),
    height: ms(32),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(2),
  },

  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    marginBottom: hp(10),
  },
  logoImage: { width: ms(36), height: ms(36), borderRadius: ms(10) },

  titleWrap: { marginBottom: hp(6) },
  title: {
    fontSize: ms(24),
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: hp(1),
    fontFamily: 'Lexend_700Bold',
  },
  subtitle: { fontSize: fontSize.sm, lineHeight: ms(20), fontWeight: '500', fontFamily: 'Lexend_500Medium' },
  trialBadge: {
    marginTop: hp(10),
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: wp(10),
    paddingVertical: hp(7),
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    alignSelf: 'flex-start',
  },
  trialBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: 'Lexend_700Bold',
  },

  body: { marginBottom: hp(2) },

  // Social buttons
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    height: hp(50),
    gap: wp(10),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
    }),
  },
  socialBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  googleIconWrap: {
    width: ms(26),
    height: ms(26),
    borderRadius: ms(13),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  googleG: { fontSize: ms(15), fontWeight: '700', color: '#4285F4' },

  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: hp(14) },
  separatorLine: { flex: 1, height: 1 },
  separatorText: { marginHorizontal: wp(14), fontSize: fontSize.xs, fontWeight: '600' },

  // Linked account card
  linkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    padding: wp(12),
    borderRadius: radius.lg,
    borderWidth: 1.5,
    marginBottom: hp(18),
  },
  linkedAvatar: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(18),
    backgroundColor: palette.charbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedTitle: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  linkedSub: { fontSize: fontSize.xs, fontWeight: '500', marginTop: 2 },
  linkedCheck: { marginRight: wp(4) },
  linkedReset: { fontSize: fontSize.xs, fontWeight: '600', textDecorationLine: 'underline' },

  // Fields
  field: { marginBottom: hp(18) },
  label: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: hp(8), letterSpacing: 0.2, fontFamily: 'Lexend_600SemiBold' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    height: hp(52),
    gap: wp(10),
  },
  input: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  errorHint: { fontSize: fontSize.xs, marginTop: hp(6), lineHeight: ms(16) },

  // Location (locate me + map)
  locationLabelRow: { flexDirection: 'row', alignItems: 'center', gap: wp(6), marginBottom: hp(8) },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(8),
    paddingVertical: hp(12),
    borderRadius: radius.lg,
    borderWidth: 1.2,
  },
  locateBtnText: { fontSize: fontSize.sm, fontFamily: 'Lexend_700Bold', fontWeight: '700' },
  mapWrapper: {
    marginTop: hp(12),
    borderRadius: radius.lg,
    overflow: 'hidden',
    height: hp(200),
    borderWidth: 1.2,
    borderColor: 'rgba(124,58,237,0.20)',
  },
  map: { flex: 1 },
  mapHint: { marginTop: hp(8), fontSize: ms(11.5), fontFamily: 'Lexend_400Regular' },
  gpsIndicator: {
    marginTop: hp(10),
    borderRadius: radius.md,
    paddingHorizontal: wp(10),
    paddingVertical: hp(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
  },
  gpsIndicatorText: { flex: 1, fontSize: ms(11.5), fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },

  // Category picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: wp(18) },
  pickerSheet: { borderRadius: radius.xl, padding: wp(16), maxHeight: hp(560) },
  pickerTitle: { fontSize: ms(16), fontFamily: 'Lexend_700Bold', fontWeight: '700', marginBottom: hp(10) },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10), paddingVertical: hp(12), paddingHorizontal: wp(12), borderRadius: radius.md },
  categoryRowText: { flex: 1, fontSize: ms(14), fontFamily: 'Lexend_500Medium', fontWeight: '500' },
  closePickerBtn: { marginTop: hp(12), alignItems: 'center', justifyContent: 'center', paddingVertical: hp(12), borderRadius: radius.md },

  // Referral
  referralToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    paddingVertical: hp(10),
    marginBottom: hp(4),
  },
  referralToggleText: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Lexend_500Medium' },
  referralFeedback: { fontSize: fontSize.xs, marginTop: hp(6), fontWeight: '500' },

  // Terms
  termsRow: { flexDirection: 'row', alignItems: 'center', marginTop: hp(1.5), marginBottom: hp(1), paddingHorizontal: wp(1) },
  checkbox: {
    width: ms(22),
    height: ms(22),
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: ms(10),
  },
  termsText: { flex: 1, fontSize: fontSize.sm, lineHeight: ms(20), fontFamily: 'Lexend_400Regular' },

  // Step error
  stepErrorBanner: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    marginBottom: hp(8),
  },
  stepErrorText: { fontSize: fontSize.sm, fontWeight: '600', textAlign: 'center', fontFamily: 'Lexend_600SemiBold' },

  // Actions
  actions: { marginTop: hp(2), marginBottom: hp(4) },
  noVerifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6), marginBottom: hp(10) },
  noVerifText: { fontSize: fontSize.xs, fontWeight: '500', fontFamily: 'Lexend_500Medium' },
  mainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: hp(48),
    borderRadius: radius.lg,
    gap: wp(8),
    ...Platform.select({
      ios: { shadowColor: '#1F2937', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  mainBtnText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'Lexend_700Bold' },

  // Footer
  footer: { marginBottom: hp(12) },
  loginPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(14),
    paddingVertical: hp(14),
    borderRadius: radius.xl,
    borderWidth: 1.5,
    gap: wp(10),
  },
  loginIconWrap: {
    width: ms(34),
    height: ms(34),
    borderRadius: ms(17),
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginPromptTitle: { fontSize: fontSize.sm, fontWeight: '500', marginBottom: 2, fontFamily: 'Lexend_500Medium' },
  loginPromptSub: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
});
