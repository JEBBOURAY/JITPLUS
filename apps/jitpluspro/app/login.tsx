import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
  Easing,
  LayoutAnimation,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { getErrorMessage } from '@/utils/error';
import { isValidEmail } from '@/utils/validation';
import { Eye, EyeOff, Mail, ArrowRight, ChevronDown, WifiOff, TriangleAlert } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';
import { AppleLogo } from '@/components/AppleLogo';
import { GoogleLogo } from '@/components/GoogleLogo';
import { ActionButton } from '@/components/ui/ActionButton';
import { useDir } from '@/hooks/useDir';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { font, icon } from '@/constants/design';
import { useSplashStore } from '@/stores/splashStore';
import { hapticError, hapticLight, hapticSuccess } from '@/utils/haptics';
import LoginBackdrop from '@/components/login/LoginBackdrop';
import LoginHeader from '@/components/login/LoginHeader';
import KhatamDivider from '@/components/login/KhatamDivider';
import PressScale from '@/components/login/PressScale';
import FadeSlideIn from '@/components/login/FadeSlideIn';

type LoginErrorType = 'none' | 'credentials' | 'generic';
interface LoginError { type: LoginErrorType; message: string }
const NO_ERROR: LoginError = { type: 'none', message: '' };

const EMAIL_ANIM_DURATION = 250;
const INTRO_ITEMS = 5;
/** Start the intro anyway if the splash never reports that it opened. */
const SPLASH_FALLBACK_MS = 3000;
const AMBER_TEXT = '#92400E';
const AMBER_TEXT_DARK = '#FCD34D';

/** Layout-only ease (no create/delete), so it never fights the Animated fades. */
const layoutEase = (duration: number) => ({
  duration,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
});

/** First field among `keys` holding a positive number (or numeric string). */
function readPositiveField(data: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === 'number' && raw > 0) return raw;
    if (typeof raw === 'string') {
      const val = Number(raw);
      if (Number.isFinite(val) && val > 0) return val;
    }
  }
  return null;
}

function parseRetryAfterMs(error: unknown): number | null {
  const err = error as {
    response?: {
      headers?: Record<string, unknown>;
      data?: Record<string, unknown>;
      status?: number;
    };
  };

  const headers = err?.response?.headers ?? {};
  const retryAfterRaw = headers['retry-after'] ?? headers['Retry-After'];

  if (typeof retryAfterRaw === 'string') {
    const seconds = Number(retryAfterRaw);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

    const retryDate = Date.parse(retryAfterRaw);
    if (!Number.isNaN(retryDate)) {
      const ms = retryDate - Date.now();
      return ms > 0 ? ms : null;
    }
  }

  if (typeof retryAfterRaw === 'number' && retryAfterRaw > 0) {
    return retryAfterRaw * 1000;
  }

  const data = err?.response?.data ?? {};

  const retryMs = readPositiveField(data, ['retryAfterMs', 'retry_after_ms']);
  if (retryMs !== null) return retryMs;

  const retrySec = readPositiveField(data, ['retryAfter', 'retry_after', 'retryAfterSeconds', 'retry_after_seconds', 'waitSeconds']);
  if (retrySec !== null) return retrySec * 1000;

  const retryMin = readPositiveField(data, ['waitMinutes', 'wait_minutes']);
  if (retryMin !== null) return retryMin * 60 * 1000;

  const message = typeof data.message === 'string' ? data.message : '';
  const minMatch = message.match(/(\d+)\s*(min|minute|minutes)/i);
  if (minMatch) return Number(minMatch[1]) * 60 * 1000;
  const secMatch = message.match(/(\d+)\s*(s|sec|second|seconds)/i);
  if (secMatch) return Number(secMatch[1]) * 1000;

  return null;
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const google = useGoogleAuth();
  const apple = useAppleAuth();
  const dir = useDir();
  const isRTL = dir.isRTL;

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  // Sent by the register screen when the address already has an account.
  const { email: prefillEmail } = useLocalSearchParams<{ email?: string }>();
  // With the address already filled in, the password is what is left to type.
  const focusPasswordRef = useRef(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loginError, setLoginError] = useState<LoginError>(NO_ERROR);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  // Minutes, not seconds: the banner shows minutes, so the screen re-renders once a minute.
  const [rateRemainingMin, setRateRemainingMin] = useState(0);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const [formMounted, setFormMounted] = useState(false);
  const [emailFormAnim] = useState(() => new Animated.Value(0));

  const dark = theme.mode === 'dark';
  const reduceMotion = useReduceMotion();
  // The screen mounts under the animated splash; hold the intro until it opens.
  const splashOpened = useSplashStore((s) => s.done);
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  const introStarted = splashOpened || splashTimedOut;

  useEffect(() => {
    if (splashOpened) return;
    const timer = setTimeout(() => setSplashTimedOut(true), SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [splashOpened]);

  const [intro] = useState(() => ({
    /** JS-driven: SVG stroke offset can't run on the native driver. */
    draw: new Animated.Value(0),
    reveal: new Animated.Value(0),
    keystone: new Animated.Value(0),
    halo: new Animated.Value(0),
    text: new Animated.Value(0),
    /** Google, Apple, divider, email, sign-up — staggered in that order. */
    items: Array.from({ length: INTRO_ITEMS }, () => new Animated.Value(0)),
    twinkle: new Animated.Value(0),
  }));
  const [compactAnim] = useState(() => new Animated.Value(0));
  const [shakeAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!introStarted || reduceMotion === null) return;
    const shown = [intro.reveal, intro.keystone, intro.text, ...intro.items];

    if (reduceMotion) {
      intro.draw.setValue(1);
      const fade = Animated.parallel(shown.map((v) => Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true })));
      fade.start();
      return () => fade.stop();
    }

    const after = (ms: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(ms), anim]);
    const sequence = Animated.parallel([
      Animated.timing(intro.draw, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      after(160, Animated.spring(intro.reveal, { toValue: 1, speed: 12, bounciness: 6, useNativeDriver: true })),
      after(280, Animated.timing(intro.text, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true })),
      after(400, Animated.timing(intro.keystone, { toValue: 1, duration: 300, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true })),
      after(360, Animated.stagger(50, intro.items.map((v) => Animated.spring(v, { toValue: 1, speed: 16, bounciness: 5, useNativeDriver: true })))),
      after(900, Animated.sequence([
        Animated.timing(intro.twinkle, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(intro.twinkle, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ])),
    ]);
    // Lantern-like breathing of the halo behind the logo.
    const breathe = Animated.loop(Animated.sequence([
      Animated.timing(intro.halo, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(intro.halo, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    sequence.start();
    breathe.start();
    return () => {
      sequence.stop();
      breathe.stop();
    };
  }, [introStarted, reduceMotion, intro]);

  // Animated styles are built once: recreating interpolations on each render
  // (every keystroke) would detach and re-attach their native nodes.
  const anim = useMemo(() => ({
    items: intro.items.map((v) => ({
      opacity: v,
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    })),
    form: {
      opacity: emailFormAnim,
      transform: [{ translateY: emailFormAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
    },
    chevron: {
      transform: [{ rotate: emailFormAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
    },
    shake: {
      transform: [{
        translateX: shakeAnim.interpolate({
          inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
          outputRange: [0, -8, 7, -5, 4, -2, 0],
        }),
      }],
    },
  }), [intro, emailFormAnim, shakeAnim]);

  const greetingKey = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'login.greetingMorning';
    if (h >= 18 || h < 5) return 'login.greetingEvening';
    return 'login.greetingDay';
  }, []);

  useEffect(() => {
    const applyOnline = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      setIsOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    };

    NetInfo.fetch().then(applyOnline).catch(() => {});
    const unsubscribe = NetInfo.addEventListener(applyOnline);
    return unsubscribe;
  }, []);

  // update() zeroes rateRemainingMin before clearing rateLimitedUntil, so no reset is needed here.
  // Ticks every second for an exact unlock, but same-value updates don't re-render.
  useEffect(() => {
    if (!rateLimitedUntil) return;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 60_000));
      setRateRemainingMin(remaining);
      if (remaining === 0) setRateLimitedUntil(null);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [rateLimitedUntil]);

  const canSubmit = isValidEmail(email) && password.length > 0;
  const isRateLimited = rateRemainingMin > 0;

  const clearCredentialError = useCallback(() => {
    setLoginError((e) => (e.type === 'credentials' ? NO_ERROR : e));
  }, []);

  const handleEmailChange = useCallback((v: string) => {
    setEmail(v);
    clearCredentialError();
  }, [clearCredentialError]);

  const handlePasswordChange = useCallback((v: string) => {
    setPassword(v);
    clearCredentialError();
  }, [clearCredentialError]);

  const openEmailForm = useCallback(() => {
    if (formMounted) return;

    // The crest shrinks and the content re-centres smoothly instead of jumping.
    if (!reduceMotion) LayoutAnimation.configureNext(layoutEase(EMAIL_ANIM_DURATION));
    setFormMounted(true);
    Animated.timing(compactAnim, {
      toValue: 1,
      duration: reduceMotion ? 0 : EMAIL_ANIM_DURATION,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
    requestAnimationFrame(() => {
      Animated.timing(emailFormAnim, {
        toValue: 1,
        duration: EMAIL_ANIM_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setTimeout(() => {
            (focusPasswordRef.current ? passwordRef : emailRef).current?.focus();
            focusPasswordRef.current = false;
          }, 10);
        }
      });
    });
  }, [formMounted, emailFormAnim, compactAnim, reduceMotion]);

  const closeEmailForm = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(emailFormAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (!reduceMotion) LayoutAnimation.configureNext(layoutEase(EMAIL_ANIM_DURATION));
      setFormMounted(false);
      Animated.timing(compactAnim, {
        toValue: 0,
        duration: reduceMotion ? 0 : EMAIL_ANIM_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, [emailFormAnim, compactAnim, reduceMotion]);

  // Wrong credentials: the fields shake once, with an error buzz.
  useEffect(() => {
    if (loginError.type !== 'credentials') return;
    hapticError();
    if (reduceMotion) return;
    shakeAnim.setValue(0);
    const anim = Animated.timing(shakeAnim, { toValue: 1, duration: 380, easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [loginError.type, reduceMotion, shakeAnim]);

  // Arriving from register with a known address: fill it in and open the form.
  useEffect(() => {
    if (!prefillEmail || !isValidEmail(prefillEmail)) return;
    setEmail(prefillEmail);
    setPassword('');
    focusPasswordRef.current = true;
    if (formMounted) passwordRef.current?.focus();
    else openEmailForm();
    // Only when a new address arrives, not on every form toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillEmail]);

  const handleEmailDisclosure = useCallback(() => {
    if (formMounted) closeEmailForm();
    else openEmailForm();
  }, [formMounted, closeEmailForm, openEmailForm]);

  // One sign-in at a time: email, Google and Apple lock each other out.
  const authBusy = isLoading || google.isLoading || apple.isLoading;
  const submitDisabled = authBusy || !canSubmit || !isOnline || isRateLimited;
  const submitIdle = submitDisabled && !isLoading;

  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    if (submitDisabled) return;

    setLoginError(NO_ERROR);

    const trimmedEmail = email.trim().toLowerCase();

    setIsLoading(true);
    try {
      // Keep session persistence enabled on mobile by default.
      await signIn({ email: trimmedEmail, password }, true);
      hapticSuccess();
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const axiosErr = err as {
        isAxiosError?: boolean;
        code?: string;
        response?: { status?: number; data?: Record<string, unknown> };
      };

      const status = axiosErr?.response?.status;
      const isNetworkError = axiosErr?.isAxiosError && (
        axiosErr?.code === 'ECONNABORTED' ||
        axiosErr?.code === 'ERR_NETWORK' ||
        !axiosErr?.response
      );

      if (status === 429) {
        const retryAfterMs = parseRetryAfterMs(err);
        if (retryAfterMs) {
          setRateLimitedUntil(Date.now() + retryAfterMs);
          setLoginError(NO_ERROR);
        } else {
          setLoginError({ type: 'generic', message: getErrorMessage(err, t('common.genericError')) });
        }
      } else if (status === 401 || status === 400) {
        setLoginError({ type: 'credentials', message: t('login.invalidCredentialsGeneric') });
      } else if (isNetworkError) {
        const net = await NetInfo.fetch();
        setIsOnline(Boolean(net.isConnected) && net.isInternetReachable !== false);
        setLoginError({ type: 'generic', message: t('common.networkErrorMsg') });
      } else {
        setLoginError({ type: 'generic', message: getErrorMessage(err, t('login.invalidCredentials')) });
      }
    } finally {
      setIsLoading(false);
    }
  }, [submitDisabled, email, password, signIn, router, t]);

  const hasCredentialError = loginError.type === 'credentials';
  const showInlineError = loginError.type !== 'none' && !!loginError.message;

  const fieldStyle = (field: 'email' | 'password') => {
    const isFocused = focusedField === field;
    const withError = hasCredentialError;

    return [
      styles.inputWrapper,
      {
        flexDirection: dir.row,
        backgroundColor: theme.inputBg,
        borderColor: withError ? theme.danger : isFocused ? palette.violet : theme.inputBorder,
      },
      isFocused && !withError && styles.inputFocus,
      withError && styles.inputError,
    ];
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <LoginBackdrop dark={dark} />

      <SafeAreaView
        edges={['top']}
        style={[styles.langBar, isRTL ? styles.langBarRtl : styles.langBarLtr]}
        // Invisible until the intro starts: don't let taps through the splash reach it.
        pointerEvents={introStarted ? 'auto' : 'none'}
      >
        <View style={[styles.langRow, { flexDirection: dir.row }]}>
          {LANGUAGES.map(({ code, flag, nativeLabel }) => {
            const active = locale === code;
            return (
              <TouchableOpacity
                key={code}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={nativeLabel}
                accessibilityState={{ selected: active }}
                onPress={async () => {
                  if (code !== locale) await setLocale(code);
                }}
                style={[
                  styles.langBtn,
                  {
                    backgroundColor: active ? `${palette.violet}14` : theme.inputBg,
                    borderColor: active ? palette.violet : theme.inputBorder,
                  },
                ]}
              >
                <Text style={styles.langFlag}>{flag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.container} edges={['bottom']} pointerEvents={introStarted ? 'auto' : 'none'}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <LoginHeader
              dark={dark}
              anims={intro}
              compact={compactAnim}
              isCompact={formMounted}
              greeting={t(greetingKey)}
              tagline={t('login.appTagline')}
              taglineColor={theme.textMuted}
            />

            <View style={styles.formSection}>
              <PressScale style={anim.items[0]}>
                {(press) => (
              <TouchableOpacity
                {...press}
                onPress={() => { hapticLight(); google.promptGoogle(); }}
                disabled={authBusy}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={t('login.loginWithGoogle')}
                style={[
                  styles.socialBtn,
                  {
                    flexDirection: dir.row,
                    backgroundColor: theme.bgCard,
                    borderColor: theme.inputBorder,
                  },
                ]}
              >
                {google.isLoading ? (
                  <ActivityIndicator color={theme.text} size="small" />
                ) : (
                  <>
                    <GoogleLogo size={ms(20)} />
                    <Text style={[styles.socialBtnText, { color: theme.text }]}>{t('login.loginWithGoogle')}</Text>
                  </>
                )}
              </TouchableOpacity>
                )}
              </PressScale>

              {Platform.OS === 'ios' && apple.isAvailable && (
                <PressScale style={anim.items[1]}>
                  {(press) => (
                    <TouchableOpacity
                      {...press}
                      onPress={() => { hapticLight(); apple.promptApple(); }}
                      disabled={authBusy}
                      activeOpacity={0.88}
                      accessibilityRole="button"
                      accessibilityLabel={t('login.loginWithApple')}
                      // Apple's guidelines: white button on dark backgrounds.
                      style={[styles.socialBtn, dark ? styles.appleBtnDark : styles.appleBtn, { flexDirection: dir.row }]}
                    >
                      {apple.isLoading ? (
                        <ActivityIndicator color={dark ? '#000' : '#fff'} size="small" />
                      ) : (
                        <>
                          <AppleLogo size={ms(19)} color={dark ? '#000' : '#fff'} />
                          <Text style={[styles.socialBtnText, { color: dark ? '#000' : '#fff' }]}>{t('login.loginWithApple')}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </PressScale>
              )}

              {!!google.error && !google.noAccount && (
                <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                  <Text style={[styles.errorText, { color: theme.danger, textAlign: dir.textAlign }]}>
                    {getErrorMessage(google.error, t('common.genericError'))}
                  </Text>
                </View>
              )}

              {google.noAccount && (
                <NoAccountBanner
                  title={t('googleAuth.noAccountTitle')}
                  message={t('googleAuth.noAccountAction')}
                  actionLabel={t('googleAuth.goToRegister')}
                  onPress={() => {
                    google.dismissNoAccount();
                    router.push('/register');
                  }}
                />
              )}

              {!!apple.error && !apple.noAccount && (
                <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                  <Text style={[styles.errorText, { color: theme.danger, textAlign: dir.textAlign }]}>{getErrorMessage(apple.error, t('common.genericError'))}</Text>
                </View>
              )}

              {apple.noAccount && (
                <NoAccountBanner
                  title={t('appleAuth.noAccountTitle')}
                  message={t('appleAuth.noAccountAction')}
                  actionLabel={t('appleAuth.goToRegister')}
                  onPress={() => {
                    apple.dismissNoAccount();
                    router.push('/register');
                  }}
                />
              )}

              <Animated.View style={anim.items[2]}>
                <KhatamDivider
                  label={t('login.orDivider')}
                  lineColor={theme.inputBorder}
                  textColor={theme.textMuted}
                  dark={dark}
                  twinkle={intro.twinkle}
                />
              </Animated.View>

              <PressScale style={anim.items[3]}>
                {(press) => (
              <TouchableOpacity
                {...press}
                onPress={() => { hapticLight(); handleEmailDisclosure(); }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ expanded: formMounted }}
                accessibilityLabel={t('login.continueWithEmail')}
                style={[styles.emailDisclosure, { flexDirection: dir.row, borderColor: palette.violet, backgroundColor: theme.bgCard }]}
              >
                <View style={styles.emailDisclosureIconWrap}>
                  <Mail size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />
                </View>
                <Text style={[styles.emailDisclosureText, { color: theme.text, textAlign: dir.textAlign }]}>
                  {t('login.continueWithEmail')}
                </Text>
                <Animated.View style={[styles.chevronWrap, anim.chevron]}>
                  <ChevronDown size={ms(18)} color={palette.violet} strokeWidth={icon.stroke} />
                </Animated.View>
              </TouchableOpacity>
                )}
              </PressScale>

              <Animated.View style={anim.items[4]}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => router.push('/register')}
                  style={styles.signupInlineWrap}
                  accessibilityRole="button"
                >
                  <Text style={styles.signupInlineText}>
                    <Text style={[styles.signupMuted, { color: theme.textMuted }]}>{t('login.noAccount')} </Text>
                    <Text style={[styles.signupLink, { color: palette.violet }]}>{t('login.createAccount')}</Text>
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {formMounted && (
              <Animated.View style={[styles.formSection, anim.form]}>
                {!isOnline && (
                  <FadeSlideIn>
                  <View
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={[styles.offlineBanner, { flexDirection: dir.row, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                  >
                    <WifiOff size={ms(15)} color={theme.textSecondary} strokeWidth={icon.stroke} />
                    <Text style={[styles.offlineText, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
                      {t('login.offlineBanner')}
                    </Text>
                  </View>
                  </FadeSlideIn>
                )}

                {isRateLimited && (
                  <FadeSlideIn>
                  <View
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={[styles.rateLimitBanner, { flexDirection: dir.row }]}
                  >
                    <TriangleAlert size={ms(15)} color={dark ? AMBER_TEXT_DARK : AMBER_TEXT} strokeWidth={icon.stroke} />
                    <Text style={[styles.rateLimitText, { color: dark ? AMBER_TEXT_DARK : AMBER_TEXT, textAlign: dir.textAlign }]}>
                      {t('login.rateLimitedBanner', { minutes: rateRemainingMin })}
                    </Text>
                  </View>
                  </FadeSlideIn>
                )}

                <Animated.View style={anim.shake}>
                <View style={styles.inputContainer}>
                  <View style={fieldStyle('email')}>
                    <Mail size={ms(17)} color={palette.violet} strokeWidth={icon.stroke} />
                    <TextInput
                      ref={emailRef}
                      style={[
                        styles.inputField,
                        { color: theme.text, textAlign: dir.textAlign },
                        isRTL && styles.inputFieldRtl,
                      ]}
                      placeholder={t('login.emailPlaceholder')}
                      placeholderTextColor={theme.inputPlaceholder}
                      value={email}
                      onChangeText={handleEmailChange}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      editable={!isLoading}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField((f) => (f === 'email' ? null : f))}
                    />
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <View style={fieldStyle('password')}>
                    <JitLock size={ms(17)} color={palette.violet} strokeWidth={icon.stroke} />
                    <TextInput
                      ref={passwordRef}
                      style={[
                        styles.inputField,
                        { color: theme.text, textAlign: dir.textAlign },
                        isRTL && styles.inputFieldRtl,
                      ]}
                      placeholder={t('login.passwordPlaceholder')}
                      placeholderTextColor={theme.inputPlaceholder}
                      value={password}
                      onChangeText={handlePasswordChange}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                      editable={!isLoading}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField((f) => (f === 'password' ? null : f))}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((p) => !p)}
                      activeOpacity={0.75}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? t('login.passwordVisibleA11y') : t('login.passwordHiddenA11y')}
                      style={styles.eyeTap}
                    >
                      {showPassword ? (
                        <EyeOff size={ms(19)} color={theme.inputPlaceholder} strokeWidth={icon.stroke} />
                      ) : (
                        <Eye size={ms(19)} color={theme.inputPlaceholder} strokeWidth={icon.stroke} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                </Animated.View>

                {showInlineError && (
                  <FadeSlideIn>
                  <View
                    style={[styles.fieldErrorRow, { flexDirection: dir.row }]}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    <TriangleAlert size={ms(13)} color={theme.danger} strokeWidth={icon.strokeSmall} />
                    <Text style={[styles.fieldErrorText, { color: theme.danger, textAlign: dir.textAlign }]}>{loginError.message}</Text>
                  </View>
                  </FadeSlideIn>
                )}

                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/forgot-password')} accessibilityRole="button">
                  <Text style={[styles.forgotText, { color: palette.violet, textAlign: isRTL ? 'left' : 'right' }]}>
                    {t('login.forgotPassword')}
                  </Text>
                </TouchableOpacity>

                <ActionButton
                  label={t('login.loginBtn')}
                  accessibilityLabel={isLoading ? t('login.connecting') : t('login.loginBtn')}
                  onPress={handleLogin}
                  disabled={submitDisabled}
                  loading={isLoading}
                  size="lg"
                  icon={ArrowRight}
                  iconPosition="end"
                  flipIconInRTL
                  gradient={submitIdle ? undefined : brandGradient}
                  iconColor={submitIdle ? theme.textMuted : undefined}
                  style={[styles.button, submitIdle ? { backgroundColor: theme.inputBg, borderColor: theme.inputBorder } : styles.buttonActiveShadow]}
                  labelStyle={submitIdle ? [styles.buttonIdleText, { color: theme.textMuted }] : undefined}
                />
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

      </SafeAreaView>
    </View>
  );
}

function NoAccountBanner({ title, message, actionLabel, onPress }: {
  title: string;
  message: string;
  actionLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const dir = useDir();
  // Charbon tints vanish on the dark background; use the light violet there.
  const dark = theme.mode === 'dark';
  return (
    <View
      style={[
        styles.noAccountBanner,
        dark
          ? { backgroundColor: `${palette.violetLight}14`, borderColor: `${palette.violetLight}40` }
          : { backgroundColor: `${palette.charbon}08`, borderColor: `${palette.charbon}25` },
      ]}
    >
      <Text style={[styles.noAccountTitle, { color: theme.text, textAlign: dir.textAlign }]}>{title}</Text>
      <Text style={[styles.noAccountMsg, { color: theme.textMuted, textAlign: dir.textAlign }]}>{message}</Text>
      <ActionButton
        label={actionLabel}
        onPress={onPress}
        icon={ArrowRight}
        iconPosition="end"
        flipIconInRTL
        style={styles.noAccountBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex1: { flex: 1 },
  container: { flex: 1 },

  langBar: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  langBarLtr: { right: 0, paddingRight: wp(16) },
  langBarRtl: { left: 0, paddingLeft: wp(16) },
  langRow: {
    gap: wp(7),
    paddingTop: hp(4),
  },
  langBtn: {
    minWidth: ms(42),
    minHeight: ms(42),
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
    }),
  },
  langFlag: { fontSize: ms(18) },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(24),
    paddingVertical: hp(20),
  },

  formSection: { paddingHorizontal: wp(4) },

  socialBtn: {
    minHeight: ms(52),
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(10),
    marginBottom: hp(10),
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 2 },
    }),
  },
  appleBtn: {
    backgroundColor: '#000',
    borderColor: '#000',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.26,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 4 },
    }),
  },
  appleBtnDark: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  socialBtnText: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },


  emailDisclosure: {
    minHeight: ms(52),
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: wp(14),
    alignItems: 'center',
    gap: wp(10),
  },
  emailDisclosureIconWrap: {
    width: ms(24),
    height: ms(24),
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailDisclosureText: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  chevronWrap: {
    minWidth: ms(24),
    alignItems: 'center',
  },

  offlineBanner: {
    minHeight: ms(44),
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: wp(12),
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(12),
  },
  offlineText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },

  rateLimitBanner: {
    minHeight: ms(44),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    paddingHorizontal: wp(12),
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(12),
  },
  rateLimitText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },

  inputContainer: { marginBottom: hp(12) },
  inputWrapper: {
    minHeight: ms(52),
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: wp(14),
    alignItems: 'center',
    gap: wp(10),
  },
  inputFocus: {
    ...Platform.select({
      ios: {
        shadowColor: palette.violet,
        shadowOpacity: 0.26,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
      },
      android: { elevation: 0 },
    }),
  },
  inputError: {
    backgroundColor: 'rgba(239,68,68,0.04)',
  },
  inputField: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font.medium,
  },
  inputFieldRtl: {
    marginRight: wp(2),
  },
  eyeTap: {
    minWidth: ms(24),
    minHeight: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
  },

  fieldErrorRow: {
    alignItems: 'center',
    gap: wp(6),
    marginTop: hp(2),
    marginBottom: hp(10),
    paddingHorizontal: wp(2),
  },
  fieldErrorText: {
    flex: 1,
    fontSize: ms(12),
    fontFamily: font.medium,
  },

  forgotText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
    marginBottom: hp(14),
  },

  button: {
    marginTop: hp(4),
    opacity: 1,
  },
  buttonActiveShadow: {
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: palette.violet,
        shadowOpacity: 0.38,
        shadowRadius: 13,
        shadowOffset: { width: 0, height: 7 },
      },
      android: { elevation: 8 },
    }),
  },
  buttonIdleText: { opacity: 0.8 },

  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    marginBottom: hp(12),
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },

  noAccountBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    marginBottom: hp(12),
    gap: hp(6),
  },
  noAccountTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  noAccountMsg: {
    fontSize: fontSize.sm,
    lineHeight: ms(20),
    fontFamily: font.regular,
  },
  noAccountBtn: {
    marginTop: hp(6),
    backgroundColor: palette.charbon,
    borderColor: palette.charbon,
  },
  signupInlineWrap: {
    marginTop: hp(10),
    marginBottom: hp(16),
  },
  signupInlineText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    fontFamily: font.regular,
  },
  signupMuted: { fontFamily: font.regular },
  signupLink: { fontFamily: font.semibold },
});
