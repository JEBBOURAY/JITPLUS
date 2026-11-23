import { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { router } from 'expo-router';
import { Mail, ArrowLeft, Check } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import { isValidEmail } from '@/utils/validation';
import { suggestEmail } from '@/utils/emailSuggestion';
import FormError from '@/components/FormError';
import { TermsCheckbox } from '@/components/completeProfile/TermsCheckbox';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';
import LoginBackdrop from '@jitplus/shared/src/login/LoginBackdrop';
import LoginHeader, { staticHeaderAnims } from '@/components/login/LoginHeader';
import KhatamDivider from '@/components/login/KhatamDivider';
import SocialAuthButtons from '@/components/login/SocialAuthButtons';
import AuthPrimaryButton from '@/components/login/AuthPrimaryButton';
import { authStyles } from '@/components/login/authUi';
import { DIR_FLIP } from '@/utils/rtl';
import { SPRING_SMOOTH, rnSpring } from '@/utils/motion';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

/** Sign-up, in the look of the login screen (zellige, brass arch, khatam divider). */
export default function RegisterScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { sendOtpEmail } = useAuth();
  const dark = theme.mode === 'dark';
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const setSignupTermsAccepted = useAuthStore((s) => s.setSignupTermsAccepted);
  // A double tap would send twice; the second answer (otpWait) opened a second code screen.
  const submittingRef = useRef(false);

  const google = useGoogleAuth({ actionLabel: t('register.signUpButton') });
  const apple = useAppleAuth({ actionLabel: t('register.signUpButton') });

  // One sign-up at a time: email, Google and Apple lock each other out.
  const busy = isLoading || google.isLoading || apple.isLoading;
  const shownError = error || google.error || apple.error;

  // The arch is already drawn (the login intro played); only the form slides in.
  const [headerAnims] = useState(staticHeaderAnims);
  const [compact] = useState(() => new Animated.Value(1));
  const [formAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.spring(formAnim, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) });
    anim.start();
    return () => anim.stop();
  }, [formAnim]);

  // First step of the admin sign-up funnel.
  useEffect(() => { api.trackSignup('screen_opened', 'all'); }, []);

  const emailValid = isValidEmail(email);
  const emailSuggestion = emailValid ? suggestEmail(email) : null;
  const canSubmit = emailValid && termsAccepted;

  const requireTerms = () => {
    if (termsAccepted) return true;
    setError(t('register.termsRequired'));
    return false;
  };

  // Google / Apple open without the box: complete-profile asks for the terms
  // when it was left unticked here, and skips the question when it was ticked.
  const beforeSocialPrompt = () => {
    setError('');
    setSignupTermsAccepted(termsAccepted);
    return true;
  };

  const handleRegister = async () => {
    if (busy || !requireTerms()) return;
    if (!emailValid) {
      setError(t('login.invalidEmail'));
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');
    const normalizedEmail = email.trim().toLowerCase();

    const result = await sendOtpEmail(normalizedEmail, true);
    submittingRef.current = false;
    setIsLoading(false);
    // otpWait: a code was sent less than a minute ago and is still valid.
    if (result.success || result.code === 'error.auth.otpWait') {
      router.push({
        pathname: '/verify-otp',
        params: { telephone: normalizedEmail, isRegister: '1' },
      });
    } else if (result.isNetworkError) {
      Alert.alert(t('common.networkError'), result.error);
    } else {
      setError(result.error || t('common.genericError'));
    }
  };

  const formStyle = {
    opacity: formAnim,
    transform: [{ translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <LoginBackdrop dark={dark} />
      <SafeAreaView style={styles.safe}>
        {/* Same back button, pinned at the same place, as verify-otp and set-password. */}
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
          style={[styles.backBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={ms(22)} color={theme.text} style={DIR_FLIP} />
        </TouchableOpacity>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.safe}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <LoginHeader dark={dark} anims={headerAnims} compact={compact} isCompact taglineColor={theme.textMuted} />

            <Animated.View style={[styles.formSection, formStyle]}>
              <Text style={[styles.title, { color: theme.text }]}>{t('register.title')}</Text>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t('register.subtitle')}</Text>

              <SocialAuthButtons
                google={google}
                apple={apple}
                googleLabel={t('register.signUpWithGoogle')}
                appleLabel={t('register.signUpWithApple')}
                disabled={busy}
                onBeforePrompt={beforeSocialPrompt}
              />

              <KhatamDivider label={t('common.or')} lineColor={theme.inputBorder} textColor={theme.textMuted} dark={dark} />

              <View style={[authStyles.inputWrapper, styles.emailField, {
                backgroundColor: theme.inputBg,
                borderColor: error && !emailValid ? theme.danger : focused || emailValid ? palette.violet : theme.inputBorder,
              }]}>
                <Mail size={ms(17)} color={palette.violet} strokeWidth={1.75} />
                <TextInput
                  style={[authStyles.inputField, { color: theme.text }]}
                  placeholder={t('login.emailPlaceholder')}
                  placeholderTextColor={theme.inputPlaceholder}
                  value={email}
                  onChangeText={(text) => { setEmail(text); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  autoComplete="email"
                  importantForAutofill="yes"
                  maxLength={254}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                />
                {emailValid && <Check size={ms(16)} color={palette.violet} strokeWidth={2.5} />}
              </View>

              {emailSuggestion && (
                <TouchableOpacity
                  onPress={() => { setEmail(emailSuggestion); setError(''); }}
                  style={styles.suggestion}
                  accessibilityRole="button"
                >
                  <Text style={[styles.suggestionText, { color: theme.textSecondary }]}>
                    {t('register.didYouMean')}{' '}
                    <Text style={{ color: palette.violet, fontWeight: '600' }}>{emailSuggestion}</Text>
                  </Text>
                </TouchableOpacity>
              )}

              <TermsCheckbox
                theme={theme}
                t={t}
                checked={termsAccepted}
                onToggle={() => { setTermsAccepted((v) => !v); setError(''); }}
                style={styles.terms}
              />

              <FormError message={shownError} />

              <AuthPrimaryButton
                label={t('register.signUpButton')}
                onPress={handleRegister}
                active={canSubmit}
                loading={isLoading}
                disabled={busy}
              />

              {/* dismissTo: register is also opened from shared deal / merchant pages,
                  where back() returned there instead of the login screen. */}
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.dismissTo('/login')} style={styles.footer} accessibilityRole="button">
                <Text style={styles.footerText}>
                  <Text style={{ color: theme.textMuted }}>{t('register.alreadyHaveAccount')} </Text>
                  <Text style={styles.footerLink}>{t('register.loginLink')}</Text>
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
  container: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: wp(24), paddingTop: hp(8), paddingBottom: hp(36) },

  backBtn: {
    width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginLeft: wp(16), marginTop: hp(8),
  },

  formSection: { paddingHorizontal: wp(4) },
  title: { fontSize: ms(24), fontWeight: '600', letterSpacing: -0.3, textAlign: 'center', marginBottom: hp(6) },
  subtitle: { fontSize: fontSize.sm, lineHeight: ms(21), textAlign: 'center', marginBottom: hp(20) },

  emailField: { marginBottom: hp(12) },

  suggestion: { marginTop: -hp(4), marginBottom: hp(12) },
  suggestionText: { fontSize: fontSize.sm },

  terms: { marginTop: 0, marginBottom: hp(14) },

  footer: { marginTop: hp(20), paddingVertical: hp(6) },
  footerText: { fontSize: fontSize.sm, textAlign: 'center' },
  footerLink: { color: palette.violet, fontWeight: '600' },
});
