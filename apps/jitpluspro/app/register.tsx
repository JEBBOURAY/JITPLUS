import React, { useReducer, useRef, useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronRight,
  Check,
  ArrowLeft,
  ArrowRight,
  LogIn,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import { isValidPassword } from '@/utils/passwordStrength';
import { isValidEmail } from '@/utils/validation';
import { getErrorMessage } from '@/utils/error';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import { useAppleIdToken } from '@/hooks/useAppleIdToken';
import { StepAccount } from '@/components/register/StepAccount';
import { StepPassword } from '@/components/register/StepPassword';
import { StepStoreConfig } from '@/components/register/StepStoreConfig';
import { StepSocialInfo } from '@/components/register/StepSocialInfo';
import BrandName from '@/components/BrandName';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

// ── Register form state ─────────────────────────────────────────
interface RegState {
  step: number;
  googleIdToken: string | null;
  appleIdentityToken: string | null;
  appleGivenName: string | undefined;
  appleFamilyName: string | undefined;
  email: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  // Store config
  nomCommerce: string;
  categorie: string;
  ville: string;
  quartier: string;
  adresse: string;
  latitude: number | null;
  longitude: number | null;
  // Social info (step 4)
  instagram: string;
  tiktok: string;
  website: string;
  storePhone: string;
  description: string;
  // Referral
  referralCode: string;
  isLoading: boolean;
}

type RegAction =
  | { type: 'SET'; payload: Partial<RegState> }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_LOADING'; loading: boolean };

const initialRegState: RegState = {
  step: 0,
  googleIdToken: null,
  appleIdentityToken: null,
  appleGivenName: undefined,
  appleFamilyName: undefined,
  email: '',
  password: '',
  confirmPassword: '',
  showPassword: false,
  nomCommerce: '',
  categorie: '',
  ville: '',
  quartier: '',
  adresse: '',
  latitude: null,
  longitude: null,
  instagram: '',
  tiktok: '',
  website: '',
  storePhone: '',
  description: '',
  referralCode: '',
  isLoading: false,
};

function regReducer(state: RegState, action: RegAction): RegState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'NEXT_STEP':
      return { ...state, step: state.step + 1 };
    case 'PREV_STEP':
      return { ...state, step: state.step - 1 };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    default:
      return state;
  }
}

const TOTAL_STEPS = 4;

// ── Premium step indicator ──────────────────────────────────────
function StepIndicator({
  current,
  total,
  theme: th,
  labels,
}: {
  current: number;
  total: number;
  theme: ReturnType<typeof useTheme>;
  labels: string[];
}) {
  return (
    <View style={si.wrap}>
      <View style={si.row}>
        {Array.from({ length: total }, (_, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <View style={si.lineWrap}>
                  <View style={[si.line, { backgroundColor: done ? palette.charbon : `${palette.charbon}20` }]} />
                </View>
              )}
              <View style={si.stepCol}>
                <View
                  style={[
                    si.circle,
                    {
                      backgroundColor: done || active ? palette.charbon : 'transparent',
                      borderColor: done || active ? palette.charbon : `${palette.charbon}30`,
                    },
                  ]}
                >
                  {done ? (
                    <Check size={ms(14)} color="#fff" strokeWidth={2.5} />
                  ) : (
                    <Text style={[si.num, { color: active ? '#fff' : `${palette.charbon}40` }]}>{i + 1}</Text>
                  )}
                </View>
                <Text
                  style={[
                    si.label,
                    {
                      color: done || active ? palette.charbon : th.textMuted,
                      fontWeight: done || active ? '700' : '500',
                    },
                  ]}
                >
                  {labels[i]}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const si = StyleSheet.create({
  wrap: { marginBottom: hp(8) },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  stepCol: { alignItems: 'center', minWidth: ms(48) },
  circle: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineWrap: { flex: 1, justifyContent: 'center', height: ms(28) },
  line: { height: ms(2), borderRadius: ms(1) },
  num: { fontSize: ms(12), fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  label: { fontSize: fontSize.xs, marginTop: hp(2), fontFamily: 'Lexend_500Medium' },
});

// ── Main ────────────────────────────────────────────────────────
export default function RegisterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { googleRegister, appleRegister, register: authRegister } = useAuth();
  const { t } = useLanguage();

  const [s, dispatch] = useReducer(regReducer, initialRegState);
  // Keep a ref to always read the latest state (avoids stale closures in async handlers)
  const sRef = useRef(s);
  sRef.current = s;

  const set = useCallback((patch: Partial<RegState>) => {
    dispatch({ type: 'SET', payload: patch });
    setStepError('');
  }, []);

  const {
    step, googleIdToken, appleIdentityToken, appleGivenName, appleFamilyName,
    email, password, confirmPassword, showPassword,
    nomCommerce, categorie, ville, quartier, adresse, latitude, longitude,
    instagram, tiktok, website, storePhone, description,
    referralCode,
    isLoading,
  } = s;

  const scrollRef = useRef<ScrollView>(null);
  const [stepError, setStepError] = useState('');

  // Google/Apple users skip password step → 3 effective steps (account, store, social)
  const isSocialAuth = !!googleIdToken || !!appleIdentityToken;
  const effectiveTotal = isSocialAuth ? 3 : TOTAL_STEPS;

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

  // Step transition animation
  const stepAnim = useRef(new Animated.Value(1)).current;
  const animateStepTransition = useCallback(() => {
    stepAnim.setValue(0);
    Animated.spring(stepAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }).start();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [stepAnim]);

  // Google ID token capture — goes straight to step 1 (store config)
  const handleGoogleToken = useCallback((idToken: string) => {
    set({ googleIdToken: idToken, appleIdentityToken: null });
    if (step === 0) {
      dispatch({ type: 'NEXT_STEP' });
      animateStepTransition();
    }
  }, [step, set, animateStepTransition]);
  const google = useGoogleIdToken(handleGoogleToken);

  // Apple ID token capture — same flow as Google (skip password)
  const handleAppleToken = useCallback((data: { identityToken: string; givenName?: string; familyName?: string }) => {
    set({
      appleIdentityToken: data.identityToken,
      appleGivenName: data.givenName,
      appleFamilyName: data.familyName,
      googleIdToken: null,
    });
    if (step === 0) {
      dispatch({ type: 'NEXT_STEP' });
      animateStepTransition();
    }
  }, [step, set, animateStepTransition]);
  const apple = useAppleIdToken(handleAppleToken);

  // Refs
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // ── Validation per step ──
  const canProceed = useMemo(() => {
    if (step === 0) {
      if (isSocialAuth) return true;
      return isValidEmail(email);
    }
    if (step === 1) {
      // Google/Apple users see store config at step 1
      if (isSocialAuth) return !!nomCommerce.trim();
      // Standard users see password at step 1
      return isValidPassword(password) && password === confirmPassword;
    }
    if (step === 2) {
      // Google/Apple users see social info at step 2 (all optional → always valid)
      if (isSocialAuth) return true;
      // Standard users see store config at step 2
      return !!nomCommerce.trim();
    }
    // Step 3 (standard only): social info — all fields optional
    if (step === 3) return true;
    return false;
  }, [step, isSocialAuth, email, password, confirmPassword, nomCommerce]);

  // ── Register ──
  const handleRegister = useCallback(async () => {
    // Read the LATEST state from the ref to avoid stale closures
    const {
      nomCommerce: nc, categorie: cat, ville: v, quartier: q,
      adresse: addr, latitude: lat, longitude: lng,
      instagram: ig, tiktok: tk, website: ws, storePhone: sp, description: desc,
      referralCode: rc,
      googleIdToken: gToken, appleIdentityToken: aToken,
      appleGivenName: aGivenName, appleFamilyName: aFamilyName,
      email: em, password: pw,
    } = sRef.current;

    // Clean social handles: strip @ prefix and full URLs
    const cleanIg = ig.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
    const cleanTk = tk.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '');
    const cleanWs = ws.trim();

    const storeData = {
      nomCommerce: nc.trim(),
      ...(cat && { categorie: cat }),
      ...(v.trim() && { ville: v.trim() }),
      ...(q.trim() && { quartier: q.trim() }),
      ...(addr.trim() && { adresse: addr.trim() }),
      ...(lat !== null && { latitude: lat }),
      ...(lng !== null && { longitude: lng }),
      ...(desc.trim() && { description: desc.trim() }),
      ...(sp.trim() && { storePhone: sp.trim() }),
      ...(cleanIg && { instagram: cleanIg }),
      ...(cleanTk && { tiktok: cleanTk }),
      ...(cleanWs && { website: cleanWs }),
      ...(rc.trim() && { referralCode: rc.trim() }),
    };

    if (gToken) {
      if (!nc.trim()) {
        Alert.alert(t('common.error'), t('registerExtra.fillAllFields'));
        return;
      }
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const result = await googleRegister(gToken, {
          ...storeData,
          termsAccepted: true,
        });
        if (result.success) {
          router.replace('/(tabs)');
        } else {
          Alert.alert(t('registerExtra.registrationError'), result.error || t('registerExtra.registrationErrorMsg'));
        }
      } catch (error: unknown) {
        const ax = error as { isAxiosError?: boolean; code?: string; response?: any };
        const isNetwork = ax?.isAxiosError && (ax?.code === 'ECONNABORTED' || ax?.code === 'ERR_NETWORK' || !ax?.response);
        Alert.alert(
          isNetwork ? t('common.networkError') : t('registerExtra.registrationError'),
          isNetwork ? t('common.networkErrorMsg') : getErrorMessage(error, t('registerExtra.registrationErrorMsg')),
        );
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
      return;
    }

    if (aToken) {
      if (!nc.trim()) {
        Alert.alert(t('common.error'), t('registerExtra.fillAllFields'));
        return;
      }
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const result = await appleRegister(aToken, aGivenName, aFamilyName, {
          ...storeData,
          termsAccepted: true,
        });
        if (result.success) {
          router.replace('/(tabs)');
        } else {
          Alert.alert(t('registerExtra.registrationError'), result.error || t('registerExtra.registrationErrorMsg'));
        }
      } catch (error: unknown) {
        const ax = error as { isAxiosError?: boolean; code?: string; response?: any };
        const isNetwork = ax?.isAxiosError && (ax?.code === 'ECONNABORTED' || ax?.code === 'ERR_NETWORK' || !ax?.response);
        Alert.alert(
          isNetwork ? t('common.networkError') : t('registerExtra.registrationError'),
          isNetwork ? t('common.networkErrorMsg') : getErrorMessage(error, t('registerExtra.registrationErrorMsg')),
        );
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
      return;
    }

    if (!em || !pw || !nc.trim()) {
      Alert.alert(t('common.error'), t('registerExtra.fillAllFields'));
      return;
    }
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      await authRegister({
        email: em.trim().toLowerCase(),
        password: pw,
        ...storeData,
        termsAccepted: true,
      });
      router.replace({
        pathname: '/verify-email',
        params: { email: em.trim().toLowerCase(), fromRegister: '1' },
      });
    } catch (error: unknown) {
      const ax = error as { isAxiosError?: boolean; code?: string; response?: any };
      const isNetwork = ax?.isAxiosError && (ax?.code === 'ECONNABORTED' || ax?.code === 'ERR_NETWORK' || !ax?.response);
      Alert.alert(
        isNetwork ? t('common.networkError') : t('registerExtra.registrationError'),
        isNetwork ? t('common.networkErrorMsg') : getErrorMessage(error, t('registerExtra.registrationErrorMsg')),
      );
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [googleRegister, appleRegister, authRegister, router, t]);

  const handleNext = useCallback(async () => {
    setStepError('');

    // Step 0: check email uniqueness (skip for Google/Apple)
    if (step === 0 && !googleIdToken && !appleIdentityToken) {
      if (!canProceed) return;
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const { data } = await api.post('/auth/check-email', { email: email.trim().toLowerCase() });
        if (data.exists) {
          setStepError(t('registerExtra.emailAlreadyUsed'));
          return;
        }
      } catch (err: unknown) {
        const ax = err as { isAxiosError?: boolean; code?: string; response?: any };
        const isNetwork = ax?.isAxiosError && (ax?.code === 'ECONNABORTED' || ax?.code === 'ERR_NETWORK' || !ax?.response);
        setStepError(isNetwork ? t('common.networkErrorMsg') : t('registerExtra.checkEmailError'));
        return;
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    }

    if (step < effectiveTotal - 1) {
      dispatch({ type: 'NEXT_STEP' });
      animateStepTransition();
    } else {
      if (canProceed) handleRegister();
    }
  }, [step, effectiveTotal, canProceed, animateStepTransition, googleIdToken, email, t, handleRegister]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      dispatch({ type: 'PREV_STEP' });
      animateStepTransition();
    } else {
      router.back();
    }
  }, [step, animateStepTransition, router]);

  const stepTitles = useMemo(() => {
    if (isSocialAuth) {
      return [
        { title: t('registerExtra.step0'), sub: t('registerExtra.sub0') },
        { title: t('registerExtra.step2Store'), sub: t('registerExtra.sub2Store') },
        { title: t('registerExtra.stepSocial'), sub: t('registerExtra.subSocial') },
      ];
    }
    return [
      { title: t('registerExtra.step0'), sub: t('registerExtra.sub0') },
      { title: t('registerExtra.step2'), sub: t('registerExtra.sub2') },
      { title: t('registerExtra.step2Store'), sub: t('registerExtra.sub2Store') },
      { title: t('registerExtra.stepSocial'), sub: t('registerExtra.subSocial') },
    ];
  }, [t, isSocialAuth]);

  const stepShortLabels = useMemo(() => isSocialAuth
    ? [t('registerExtra.stepShort0'), t('registerExtra.stepShort2Store'), t('registerExtra.stepShortSocial')]
    : [t('registerExtra.stepShort0'), t('registerExtra.stepShort2'), t('registerExtra.stepShort2Store'), t('registerExtra.stepShortSocial')],
  [t, isSocialAuth]);

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Header ── */}
            <Animated.View style={{
              opacity: headerAnim,
              transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            }}>
              {/* Back */}
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: `${theme.text}08` }]}
                onPress={handleBack}
                activeOpacity={0.7}
              >
                <ArrowLeft size={ms(20)} color={theme.text} strokeWidth={1.5} />
              </TouchableOpacity>

              {/* Brand (step 0) */}
              {step === 0 && (
                <View style={styles.brandHeader}>
                  <Image
                    source={require('@/assets/images/jitplusprologo.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                  <BrandName fontSize={24} />
                </View>
              )}

              {/* Step indicator */}
              <StepIndicator current={step} total={effectiveTotal} theme={theme} labels={stepShortLabels} />

              {/* Step title */}
              <View style={styles.stepHeader}>
                <Text style={[styles.stepLabel, { color: palette.charbon }]}>
                  {t('registerExtra.stepLabel', { current: step + 1, total: effectiveTotal })}
                </Text>
                <Text style={[styles.title, { color: theme.text }]}>
                  {stepTitles[step].title}
                </Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                  {stepTitles[step].sub}
                </Text>
              </View>
            </Animated.View>

            {/* ── Step content ── */}
            <Animated.View style={[styles.stepContent, {
              opacity: stepAnim,
              transform: [{ translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            }]}>
              {step === 0 && (
                <StepAccount
                  theme={theme}
                  t={t}
                  email={email}
                  setEmail={(v) => set({ email: v })}
                  emailRef={emailRef}
                  googleIdToken={googleIdToken}
                  setGoogleIdToken={(v) => set({ googleIdToken: v })}
                  appleIdentityToken={appleIdentityToken}
                  setAppleIdentityToken={(v) => set({ appleIdentityToken: v, appleGivenName: undefined, appleFamilyName: undefined })}
                  google={google}
                  apple={apple}
                  isLoading={isLoading}
                />
              )}

              {step === 1 && !isSocialAuth && (
                <StepPassword
                  theme={theme}
                  t={t}
                  password={password}
                  setPassword={(v) => set({ password: v })}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={(v) => set({ confirmPassword: v })}
                  showPassword={showPassword}
                  setShowPassword={(v) => set({ showPassword: v })}
                  passwordRef={passwordRef}
                  confirmRef={confirmRef}
                  isLoading={isLoading}
                />
              )}

              {((step === 1 && isSocialAuth) || (step === 2 && !isSocialAuth)) && (
                <StepStoreConfig
                  theme={theme}
                  t={t}
                  store={{ nomCommerce, categorie: categorie as any, ville, quartier, adresse, latitude, longitude }}
                  setStore={(patch) => set(patch as Partial<RegState>)}
                />
              )}

              {((step === 2 && isSocialAuth) || (step === 3 && !isSocialAuth)) && (
                <StepSocialInfo
                  theme={theme}
                  t={t}
                  data={{ instagram, tiktok, website, storePhone, description, referralCode }}
                  setData={(patch) => set(patch as Partial<RegState>)}
                />
              )}
            </Animated.View>

            {/* ── Step error ── */}
            {!!stepError && (
              <View style={[styles.stepErrorBanner, { backgroundColor: `${theme.danger}12`, borderColor: `${theme.danger}30` }]}>
                <Text style={[styles.stepErrorText, { color: theme.danger }]}>{stepError}</Text>
              </View>
            )}

            {/* ── Action button ── */}
            <Animated.View style={[styles.actions, { opacity: footerAnim }]}>
              <TouchableOpacity
                style={[
                  styles.mainBtn,
                  { backgroundColor: canProceed ? palette.charbon : `${palette.charbon}30` },
                ]}
                onPress={handleNext}
                disabled={!canProceed || isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : step < effectiveTotal - 1 ? (
                  <>
                    <Text style={[styles.mainBtnText, { opacity: canProceed ? 1 : 0.5 }]}>
                      {t('registerExtra.nextBtn')}
                    </Text>
                    <ChevronRight size={ms(18)} color={canProceed ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} />
                  </>
                ) : (
                  <>
                    <Text style={[styles.mainBtnText, { opacity: canProceed ? 1 : 0.5 }]}>
                      {t('registerExtra.finishBtn')}
                    </Text>
                    <Check size={ms(18)} color={canProceed ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* ── Already have account (step 0 only) ── */}
            {step === 0 && (
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
                  <Text style={[styles.loginPromptSub, { color: palette.charbon }]}>
                    {t('register.loginLink')}
                  </Text>
                </View>
                <ArrowRight size={ms(16)} color={palette.charbon} strokeWidth={2} />
              </TouchableOpacity>
            </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

      </SafeAreaView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex1: { flex: 1 } as const,
  safeArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: wp(20),
    paddingTop: hp(2),
    paddingBottom: hp(6),
  },

  // Back
  backBtn: {
    width: ms(32),
    height: ms(32),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(2),
  },

  // Brand
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    marginBottom: hp(10),
  },
  logoImage: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(10),
  },

  // Step header
  stepHeader: { marginBottom: hp(4) },
  stepLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: hp(2),
    fontFamily: 'Lexend_700Bold',
  },
  title: {
    fontSize: ms(20),
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: hp(1),
    fontFamily: 'Lexend_700Bold',
  },
  subtitle: {
    fontSize: fontSize.xs,
    lineHeight: ms(18),
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
  },

  // Step content
  stepContent: { marginBottom: hp(2) },

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
  mainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: hp(48),
    borderRadius: radius.lg,
    gap: wp(8),
    ...Platform.select({
      ios: {
        shadowColor: '#1F2937',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
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
