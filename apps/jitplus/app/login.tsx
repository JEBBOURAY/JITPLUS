import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { Mail, Lock, ChevronDown } from 'lucide-react-native';
import { goHomeAfterLogin } from '@/services/pendingDeal';
import { flagHomeWelcome } from '@/hooks/useHomeBanners';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLaunchStore } from '@/stores/launchStore';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { isValidEmail } from '@/utils/validation';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';
import { haptic } from '@/utils/haptics';
import FormError from '@/components/FormError';
import { PasswordField } from '@/components/PasswordField';
import LoginBackdrop from '@jitplus/shared/src/login/LoginBackdrop';
import LoginHeader from '@/components/login/LoginHeader';
import KhatamDivider from '@/components/login/KhatamDivider';
import PressScale from '@jitplus/shared/src/login/PressScale';
import FadeSlideIn from '@jitplus/shared/src/login/FadeSlideIn';
import SocialAuthButtons from '@/components/login/SocialAuthButtons';
import AuthPrimaryButton from '@/components/login/AuthPrimaryButton';
import { authStyles } from '@/components/login/authUi';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const EMAIL_ANIM_DURATION = 250;
/** Google, Apple, divider, email, sign-up: staggered in that order. */
const INTRO_ITEMS = 5;
/** Start the intro anyway if the launch animation never reports that it opened. */
const SPLASH_FALLBACK_MS = 3000;

const LANGS = [
  // Written names, not flags: a flag is a country, not a language (🇲🇦 for
  // Arabic), and older Android phones render flags as plain letter pairs.
  { code: 'fr' as const, short: 'FR', label: 'Français' },
  { code: 'en' as const, short: 'EN', label: 'English' },
  { code: 'ar' as const, short: 'ع', label: 'العربية' },
];

/** Layout-only ease (no create/delete), so it never fights the Animated fades. */
const layoutEase = (duration: number) => ({
  duration,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
});

/**
 * Entry screen of every signed-out client (the old welcome carousel is gone):
 * Google / Apple first, email unfolds below, then sign-up.
 * Same layout and motion as the JitPlus Pro login.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const { loginWithEmail, sendOtpEmail } = useAuth();
  const google = useGoogleAuth({ actionLabel: t('login.loginButton') });
  const apple = useAppleAuth({ actionLabel: t('login.loginButton') });
  const dark = theme.mode === 'dark';
  const reduceMotion = useReducedMotion();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // The password field tracks its own focus (PasswordField variant="auth").
  const [emailFocused, setEmailFocused] = useState(false);
  const onPasswordChange = useCallback((v: string) => { setPassword(v); setError(''); }, []);
  const [formMounted, setFormMounted] = useState(false);
  // A double tap would send two codes and open two code screens.
  const codeRef = useRef(false);

  // ── Intro, held until the launch animation opens onto this screen ──
  const launchDone = useLaunchStore((s) => s.done);
  const [launchTimedOut, setLaunchTimedOut] = useState(false);
  const introStarted = launchDone || launchTimedOut;
  useEffect(() => {
    if (launchDone) return;
    const timer = setTimeout(() => setLaunchTimedOut(true), SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [launchDone]);

  const [intro] = useState(() => ({
    /** JS-driven: SVG stroke offset can't run on the native driver. */
    draw: new Animated.Value(0),
    reveal: new Animated.Value(0),
    keystone: new Animated.Value(0),
    text: new Animated.Value(0),
    items: Array.from({ length: INTRO_ITEMS }, () => new Animated.Value(0)),
    twinkle: new Animated.Value(0),
  }));
  const [compactAnim] = useState(() => new Animated.Value(0));
  const [emailFormAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!introStarted) return;
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
    sequence.start();
    return () => sequence.stop();
  }, [introStarted, reduceMotion, intro]);

  // Built once: recreating interpolations on each keystroke would re-attach native nodes.
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
  }), [intro, emailFormAnim]);

  const greetingKey = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'login.greetingMorning';
    if (h >= 18 || h < 5) return 'login.greetingEvening';
    return 'login.greetingDay';
  }, []);

  // ── Email form unfolds under the email button ──
  const openEmailForm = useCallback(() => {
    if (formMounted) return;
    if (!reduceMotion) LayoutAnimation.configureNext(layoutEase(EMAIL_ANIM_DURATION));
    setFormMounted(true);
    Animated.timing(compactAnim, {
      toValue: 1, duration: reduceMotion ? 0 : EMAIL_ANIM_DURATION, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
    }).start();
    requestAnimationFrame(() => {
      Animated.timing(emailFormAnim, { toValue: 1, duration: EMAIL_ANIM_DURATION, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setTimeout(() => emailRef.current?.focus(), 10); });
    });
  }, [formMounted, emailFormAnim, compactAnim, reduceMotion]);

  const closeEmailForm = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(emailFormAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      if (!reduceMotion) LayoutAnimation.configureNext(layoutEase(EMAIL_ANIM_DURATION));
      setFormMounted(false);
      Animated.timing(compactAnim, {
        toValue: 0, duration: reduceMotion ? 0 : EMAIL_ANIM_DURATION, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      }).start();
    });
  }, [emailFormAnim, compactAnim, reduceMotion]);

  const toggleEmailForm = useCallback(() => {
    if (formMounted) closeEmailForm();
    else openEmailForm();
  }, [formMounted, closeEmailForm, openEmailForm]);

  const emailValid = isValidEmail(email);
  const canSubmit = emailValid && password.length > 0;
  // One sign-in at a time: email, Google and Apple lock each other out.
  const authBusy = isLoading || google.isLoading || apple.isLoading;

  // ── Email + password ──
  const handleLogin = useCallback(async () => {
    if (authBusy) return;
    if (!emailValid) { setError(t('login.invalidEmail')); return; }
    if (!password) { setError(t('login.emptyPassword')); return; }
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');
    const result = await loginWithEmail(email.trim().toLowerCase(), password);
    setIsLoading(false);
    if (result.success) {
      await flagHomeWelcome('back');
      goHomeAfterLogin(router);
    } else if (result.isNetworkError) {
      Alert.alert(t('common.networkError'), result.error);
    } else {
      setError(result.error || t('common.genericError'));
    }
  }, [authBusy, emailValid, password, email, loginWithEmail, t]);

  // ── Email code: forgot password, or a login without password ──
  const sendCode = useCallback(async (mode: 'reset' | 'login') => {
    if (codeRef.current || authBusy) return;
    if (!emailValid) {
      setError(t(mode === 'reset' ? 'login.forgotPasswordPrompt' : 'login.invalidEmail'));
      emailRef.current?.focus();
      return;
    }
    codeRef.current = true;
    setIsLoading(true);
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    const result = await sendOtpEmail(normalizedEmail, false);
    codeRef.current = false;
    setIsLoading(false);
    // otpWait: a code was sent less than a minute ago and is still valid.
    if (result.success || result.code === 'error.auth.otpWait') {
      router.push({
        pathname: '/verify-otp',
        params: { telephone: normalizedEmail, ...(mode === 'reset' ? { isForgotPassword: '1' } : {}) },
      });
    } else {
      setError(result.error || t('login.resetCodeError'));
    }
  }, [authBusy, emailValid, email, sendOtpEmail, t]);

  const socialError = google.error || apple.error;
  // Red on the field at fault: the address while it is invalid, else the password.
  const faultyField = !error ? null : emailValid ? 'password' : 'email';
  const emailFieldStyle = [
    authStyles.inputWrapper,
    {
      backgroundColor: theme.inputBg,
      borderColor: faultyField === 'email' ? theme.danger : emailFocused ? palette.violet : theme.inputBorder,
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <LoginBackdrop dark={dark} />

      {/* Language: chosen before anything else, as on the old welcome screen. */}
      <SafeAreaView edges={['top']} style={styles.langBar} pointerEvents={introStarted ? 'auto' : 'none'}>
        <View style={styles.langRow}>
          {LANGS.map(({ code, short, label }) => {
            const active = locale === code;
            return (
              <TouchableOpacity
                key={code}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                onPress={() => { if (code !== locale) void setLocale(code); }}
                style={[styles.langBtn, {
                  backgroundColor: active ? `${palette.violet}14` : theme.inputBg,
                  borderColor: active ? palette.violet : theme.inputBorder,
                }]}
              >
                <Text style={[styles.langShort, { color: active ? palette.violet : theme.textSecondary }]}>{short}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.flex1} edges={['bottom']} pointerEvents={introStarted ? 'auto' : 'none'}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <LoginHeader
              dark={dark}
              anims={intro}
              compact={compactAnim}
              isCompact={formMounted}
              greeting={t(greetingKey)}
              tagline={t('login.tagline')}
              subtitle={t('login.valueProp')}
              taglineColor={theme.textMuted}
            />

            <View style={styles.formSection}>
              <SocialAuthButtons
                google={google}
                apple={apple}
                googleLabel={t('login.loginWithGoogle')}
                appleLabel={t('login.loginWithApple')}
                disabled={authBusy}
                itemStyles={[anim.items[0], anim.items[1]]}
              />

              {!!socialError && <FormError message={socialError} />}

              <Animated.View style={anim.items[2]}>
                <KhatamDivider label={t('common.or')} lineColor={theme.inputBorder} textColor={theme.textMuted} dark={dark} twinkle={intro.twinkle} />
              </Animated.View>

              <PressScale style={anim.items[3]}>
                {(press) => (
                  <TouchableOpacity
                    {...press}
                    onPress={() => { haptic(); toggleEmailForm(); }}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: formMounted }}
                    accessibilityLabel={t('login.continueWithEmail')}
                    style={[styles.emailDisclosure, { borderColor: palette.violet, backgroundColor: theme.bgCard }]}
                  >
                    <View style={styles.emailIconWrap}>
                      <Mail size={ms(16)} color={palette.violet} strokeWidth={1.75} />
                    </View>
                    <Text style={[styles.emailDisclosureText, { color: theme.text }]}>{t('login.continueWithEmail')}</Text>
                    <Animated.View style={[styles.chevronWrap, anim.chevron]}>
                      <ChevronDown size={ms(18)} color={palette.violet} strokeWidth={1.75} />
                    </Animated.View>
                  </TouchableOpacity>
                )}
              </PressScale>
            </View>

            {formMounted && (
              <Animated.View style={[styles.formSection, styles.emailForm, anim.form]}>
                <View style={styles.inputContainer}>
                  <View style={emailFieldStyle}>
                    <Mail size={ms(17)} color={palette.violet} strokeWidth={1.75} />
                    <TextInput
                      ref={emailRef}
                      style={[authStyles.inputField, { color: theme.text }]}
                      placeholder={t('login.emailPlaceholder')}
                      placeholderTextColor={theme.inputPlaceholder}
                      value={email}
                      onChangeText={(v) => { setEmail(v); setError(''); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      importantForAutofill="yes"
                      maxLength={254}
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      editable={!isLoading}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                    />
                  </View>
                </View>

                <PasswordField
                  variant="auth"
                  inputRef={passwordRef}
                  icon={Lock}
                  placeholder={t('login.password')}
                  value={password}
                  onChangeText={onPasswordChange}
                  invalid={faultyField === 'password'}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!isLoading}
                />

                {!!error && <FadeSlideIn><FormError message={error} /></FadeSlideIn>}

                <TouchableOpacity activeOpacity={0.7} onPress={() => { void sendCode('reset'); }} accessibilityRole="button">
                  <Text style={[styles.forgotText, { color: palette.violet }]}>{t('login.forgotPassword')}</Text>
                </TouchableOpacity>

                <AuthPrimaryButton
                  label={t('login.loginButton')}
                  onPress={handleLogin}
                  active={canSubmit}
                  loading={isLoading}
                  disabled={authBusy}
                />

                {/* No password needed: accounts created without one sign in this way. */}
                <TouchableOpacity onPress={() => { void sendCode('login'); }} activeOpacity={0.7} style={styles.codeLoginBtn} accessibilityRole="button">
                  <Mail size={ms(16)} color={palette.violet} strokeWidth={2} />
                  <Text style={[styles.codeLoginText, { color: palette.violet }]}>{t('login.codeLogin')}</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            <Animated.View style={anim.items[4]}>
              <TouchableOpacity activeOpacity={0.75} onPress={() => router.push('/register')} style={styles.signupWrap} accessibilityRole="button">
                <Text style={styles.signupText}>
                  <Text style={{ color: theme.textMuted }}>{t('login.noAccount')} </Text>
                  <Text style={[styles.signupLink, { color: palette.violet }]}>{t('login.signUp')}</Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex1: { flex: 1 },

  langBar: { position: 'absolute', top: 0, end: 0, zIndex: 10, paddingEnd: wp(16) },
  langRow: { flexDirection: 'row', gap: wp(7), paddingTop: hp(4) },
  langBtn: {
    minWidth: ms(42), minHeight: ms(42), borderRadius: radius.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  langShort: { fontSize: ms(14), fontWeight: '600' },

  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: wp(24), paddingTop: hp(56), paddingBottom: hp(36) },
  formSection: { paddingHorizontal: wp(4) },
  emailForm: { marginTop: hp(14) },

  emailDisclosure: {
    flexDirection: 'row', minHeight: ms(52), borderRadius: radius.md, borderWidth: 1.5,
    paddingHorizontal: wp(14), alignItems: 'center', gap: wp(10),
  },
  emailIconWrap: {
    width: ms(24), height: ms(24), borderRadius: 8, backgroundColor: 'rgba(124,58,237,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  emailDisclosureText: { flex: 1, fontSize: fontSize.md, fontWeight: '600' },
  chevronWrap: { minWidth: ms(24), alignItems: 'center' },

  inputContainer: { marginBottom: hp(12) },

  // alignSelf, not textAlign: flex-end follows the reading direction under forceRTL.
  forgotText: { alignSelf: 'flex-end', fontSize: fontSize.sm, fontWeight: '600', marginBottom: hp(14) },

  codeLoginBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8), marginTop: hp(14), paddingVertical: hp(6) },
  codeLoginText: { fontSize: fontSize.sm, fontWeight: '600' },

  signupWrap: { marginTop: hp(22), marginBottom: hp(6) },
  signupText: { fontSize: fontSize.sm, textAlign: 'center' },
  signupLink: { fontWeight: '600' },

});
