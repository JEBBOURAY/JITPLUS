import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { router } from 'expo-router';
import { ArrowRight, Mail, ChevronLeft, Lock, Eye, EyeOff, Check, CheckCircle } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { isValidEmail } from '@/utils/validation';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { haptic } from '@/utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BrandText from '@/components/BrandText';
import FormError from '@/components/FormError';
import { GoogleLogo } from '@/components/GoogleLogo';

type LoginMethod = 'select' | 'email' | 'google';

export default function LoginScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { loginWithEmail, sendOtpEmail } = useAuth();
  const [method, setMethod] = useState<LoginMethod>('select');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Animations
  const logoAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const footerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.stagger(150, [
      Animated.spring(logoAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
      Animated.timing(footerAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailValid = isValidEmail(email);

  const handleBack = useCallback(() => {
    setError('');
    setMethod('select');
    Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }).start();
  }, [cardAnim]);

  // Google auth — shared hook (no stale closures, no setTimeout)
  const google = useGoogleAuth({ actionLabel: t('login.loginButton'), onCancel: handleBack });

  // Sync google hook errors/loading into local state
  useEffect(() => { if (google.error) setError(google.error); }, [google.error]);
  useEffect(() => { if (method === 'google') setIsLoading(google.isLoading); }, [google.isLoading, method]);

  const selectMethod = (m: LoginMethod) => {
    setError('');
    cardAnim.setValue(0);
    setMethod(m);
    Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 4 }).start();
  };

  // ── Email + Password flow ──
  const handleEmailContinue = async () => {
    if (!emailValid) {
      setError(t('login.invalidEmail'));
      return;
    }
    if (!password || password.length < 8) {
      setError(t('login.passwordTooShort'));
      return;
    }
    setIsLoading(true);
    setError('');
    const normalizedEmail = email.trim().toLowerCase();

    const result = await loginWithEmail(normalizedEmail, password, rememberMe);
    setIsLoading(false);
    if (result.success) {
      await AsyncStorage.setItem('showWelcome', '1');
      router.replace('/(tabs)/qr');
    } else {
      // Show Alert for network errors, inline error for others
      if (result.error && result.error === t('common.networkError')) Alert.alert(t('common.networkError'), result.error);
      else setError(result.error || t('common.genericError'));
    }
  };

  // ── Forgot password flow ──
  const handleForgotPassword = async () => {
    if (!emailValid) {
      setError(t('login.forgotPasswordPrompt'));
      return;
    }
    setIsLoading(true);
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    const result = await sendOtpEmail(normalizedEmail, false);
    setIsLoading(false);
    if (result.success) {
      router.push({
        pathname: '/verify-otp',
        params: { telephone: normalizedEmail, isEmail: '1', isForgotPassword: '1' },
      });
    } else {
      setError(result.error || t('login.resetCodeError'));
    }
  };

  // ── Render ──
  const renderMethodSelect = () => (
    <Animated.View style={[styles.methodSection, {
      opacity: cardAnim,
      transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
    }]}>
      {/* Google */}
      <TouchableOpacity
        style={[styles.socialBtn, { backgroundColor: theme.bgCard, borderColor: theme.inputBorder }]}
        onPress={() => { haptic(); selectMethod('google'); google.promptGoogle(); }}
        disabled={isLoading || google.isLoading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('login.loginWithGoogle')}
      >
        <GoogleLogo size={ms(20)} />
        <Text style={[styles.socialBtnText, { color: theme.text }]}>{t('login.loginWithGoogle')}</Text>
      </TouchableOpacity>

      {/* Show Google errors on this screen too (safety net) */}
      {error ? <FormError message={error} /> : null}

      {/* Separator */}
      <View style={styles.separator}>
        <View style={[styles.separatorLine, { backgroundColor: theme.inputBorder }]} />
        <Text style={[styles.separatorText, { color: theme.inputPlaceholder }]}>{t('common.or')}</Text>
        <View style={[styles.separatorLine, { backgroundColor: theme.inputBorder }]} />
      </View>

      {/* Email */}
      <TouchableOpacity
        style={[styles.socialBtn, { backgroundColor: palette.violet }]}
        onPress={() => selectMethod('email')}
        activeOpacity={0.7}
      >
        <Mail size={ms(20)} color="#fff" strokeWidth={1.5} />
        <Text style={[styles.socialBtnText, { color: '#fff' }]}>{t('login.loginByEmail')}</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderEmailForm = () => (
    <Animated.View style={[styles.methodSection, {
      opacity: cardAnim,
      transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
    }]}>
      <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <ChevronLeft size={ms(22)} color={theme.text} strokeWidth={1.5} />
      </TouchableOpacity>

      <View style={{ marginBottom: hp(24) }}>
        <Text style={[styles.registerTitle, { color: theme.text }]}>{t('login.emailLoginTitle')}</Text>
        <Text style={[styles.registerSubtitle, { color: theme.inputPlaceholder }]}>
          {t('login.emailLoginSubtitle')}
        </Text>
      </View>

      <View style={styles.inputContainer}>
        <View style={[styles.inputWrapper, {
          backgroundColor: theme.inputBg,
          borderColor: error ? theme.danger : emailValid ? palette.violet : theme.inputBorder,
          borderWidth: emailValid ? 2 : 1.5,
        }]}>
          <Mail size={ms(18)} color={emailValid ? palette.violet : theme.inputPlaceholder} strokeWidth={1.5} />
          <TextInput
            style={[styles.emailInput, { color: theme.text }]}
            placeholder={t('login.emailPlaceholder')}
            placeholderTextColor={theme.inputPlaceholder}
            value={email}
            onChangeText={(text) => { setEmail(text); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <View style={[styles.inputWrapper, {
          backgroundColor: theme.inputBg,
          borderColor: error ? theme.danger : password.length >= 8 ? palette.violet : theme.inputBorder,
          borderWidth: password.length >= 8 ? 2 : 1.5,
        }]}>
          <Lock size={ms(18)} color={password.length >= 8 ? palette.violet : theme.inputPlaceholder} strokeWidth={1.5} />
          <TextInput
            style={[styles.emailInput, { color: theme.text }]}
            placeholder={t('login.password')}
            placeholderTextColor={theme.inputPlaceholder}
            value={password}
            onChangeText={(text) => { setPassword(text); setError(''); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}>
            {showPassword ? (
              <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
            ) : (
              <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FormError message={error} />

      <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
        <Text style={[styles.forgotPasswordText, { color: palette.violet }]}>{t('login.forgotPassword')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.rememberRow}
        onPress={() => setRememberMe(!rememberMe)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, { borderColor: rememberMe ? palette.violet : theme.inputBorder, backgroundColor: rememberMe ? palette.violet : 'transparent' }]}>
          {rememberMe && <Check size={ms(14)} color="#fff" strokeWidth={3} />}
        </View>
        <Text style={[styles.rememberText, { color: theme.text }]}>{t('login.rememberMe')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleEmailContinue}
        disabled={isLoading}
        activeOpacity={0.85}
        style={[styles.button, { backgroundColor: emailValid && password.length >= 8 ? palette.violet : '#D4D0E8' }]}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : (
          <>
            <Text style={[styles.buttonText, { opacity: emailValid && password.length >= 8 ? 1 : 0.5 }]}>{t('login.loginButton')}</Text>
            <ArrowRight size={ms(18)} color={emailValid && password.length >= 8 ? '#fff' : 'rgba(255,255,255,0.5)'} />
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );

  const renderGoogleLoading = () => (
    <Animated.View style={[styles.methodSection, {
      opacity: cardAnim,
      transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
    }]}>
      <TouchableOpacity
        onPress={handleBack}
        disabled={isLoading || google.isSuccess}
        style={[styles.backBtn, (isLoading || google.isSuccess) && { opacity: 0.3 }]}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <ChevronLeft size={ms(22)} color={theme.text} strokeWidth={1.5} />
      </TouchableOpacity>

      <View style={[styles.formHeader, { alignItems: 'center' }]}>
        <View style={[styles.formIconBg, { backgroundColor: '#f5f5f5' }]}>
          <GoogleLogo size={ms(32)} />
        </View>
        <Text style={[styles.cardTitle, { color: theme.text, textAlign: 'center' }]}>{t('login.googleLoginTitle')}</Text>
        {isLoading ? (
          <View style={{ alignItems: 'center', gap: hp(12), marginTop: hp(16) }}>
            <ActivityIndicator size="large" color={palette.violet} />
            <Text style={[styles.cardSubtitle, { color: theme.textMuted, textAlign: 'center' }]}>{t('login.googleLoginInProgress')}</Text>
          </View>
        ) : google.isSuccess ? (
          <View style={{ alignItems: 'center', gap: hp(10), marginTop: hp(16) }}>
            <CheckCircle size={ms(52)} color="#34A853" strokeWidth={1.5} />
            <Text style={{ color: '#34A853', fontWeight: '700', fontSize: fontSize.md }}>{t('googleAuth.success')}</Text>
          </View>
        ) : error ? (
          <>
            <Text style={[styles.errorText, { color: theme.danger, marginTop: hp(12) }]}>{error}</Text>
            <TouchableOpacity
              onPress={() => { haptic(); google.promptGoogle(); }}
              activeOpacity={0.85}
              style={[styles.button, { marginTop: hp(16), width: '100%', backgroundColor: palette.violet }]}
            >
              <Text style={styles.buttonText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </Animated.View>
  );

  return (
    <View style={[styles.gradient, { backgroundColor: '#fff' }]}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Logo ── */}
            {method === 'select' ? (
              <Animated.View style={[styles.header, {
                opacity: logoAnim,
                transform: [{
                  scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
                }],
              }]}>
              <View style={styles.brandRow}>
                <Image
                  source={require('@/assets/images/jitpluslogo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
                <BrandText size={28} />
              </View>
              <Text style={styles.tagline}>{t('login.tagline')}</Text>
            </Animated.View>
          ) : (
            <View style={styles.headerSmall}>
              <View style={styles.brandRow}>
                <Image
                  source={require('@/assets/images/jitpluslogo.png')}
                  style={styles.logoImageSmall}
                  resizeMode="contain"
                />
                <BrandText size={16} />
              </View>
              </View>
            )}

            {/* ── Content ── */}
            {method === 'select' && renderMethodSelect()}
            {method === 'email' && renderEmailForm()}
            {method === 'google' && renderGoogleLoading()}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer – anchored at the bottom */}
        {(method === 'select' || method === 'email') && (
          <Animated.View style={[styles.footerContainer, { opacity: footerAnim }]}>
            <Text style={styles.footerText}>{t('login.noAccount')}{' '}</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/register')}>
              <Text style={styles.footerLink}>{t('login.signUp')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: wp(24), paddingVertical: hp(20) },

  // Logo
  header: { alignItems: 'center', marginBottom: hp(32) },
  brandRow: { flexDirection: 'column', alignItems: 'center', gap: ms(6) },
  logoImage: { width: ms(80), height: ms(80), borderRadius: ms(20) },
  headerSmall: { alignItems: 'center', marginBottom: hp(16), marginTop: hp(8) },
  logoImageSmall: { width: ms(40), height: ms(40), borderRadius: ms(10) },
  tagline: {
    fontSize: fontSize.sm, color: '#999', fontWeight: '500',
    letterSpacing: 0.5, marginTop: hp(4),
  },

  // Section (no card)
  methodSection: {
    paddingHorizontal: wp(4),
  },
  cardTitle: { fontSize: fontSize['2xl'], fontWeight: '700', marginBottom: hp(6), letterSpacing: -0.3 },
  cardSubtitle: { fontSize: fontSize.sm, lineHeight: ms(22), marginBottom: hp(20) },
  registerTitle: {
    fontSize: ms(26), fontWeight: '700', letterSpacing: -0.3,
    marginBottom: hp(8),
  },
  registerSubtitle: {
    fontSize: fontSize.sm, lineHeight: ms(22),
    marginBottom: hp(24),
  },

  // Social buttons
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: hp(54), borderRadius: radius.lg, gap: wp(10),
    marginBottom: hp(12), borderWidth: 1.5, borderColor: 'transparent',
  },
  socialIcon: { width: ms(22), height: ms(22) },
  googleIconWrap: {
    width: ms(24), height: ms(24), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontSize: ms(18), fontWeight: '700', color: '#EA4335' },
  socialBtnText: { fontSize: fontSize.md, fontWeight: '600', letterSpacing: 0.2 },

  // Separator
  separator: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: hp(8), gap: wp(12),
  },
  separatorLine: { flex: 1, height: 1 },
  separatorText: { fontSize: fontSize.sm, fontWeight: '500' },

  // Footer
  footerContainer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingTop: hp(12), paddingBottom: hp(32),
  },
  footerText: { fontSize: fontSize.sm, color: palette.gray400 },
  footerLink: { fontSize: fontSize.sm, color: palette.violet, fontWeight: '700' },

  // Form common
  backBtn: {
    width: ms(36), height: ms(36), borderRadius: ms(18),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: hp(8),
  },
  formHeader: { marginBottom: hp(20) },
  formIconBg: {
    width: ms(52), height: ms(52), borderRadius: ms(16),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: hp(14),
  },

  // Input
  inputContainer: { marginBottom: hp(16) },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, paddingHorizontal: wp(14), height: hp(58),
  },
  emailInput: { flex: 1, fontSize: fontSize.md, fontWeight: '500', marginLeft: wp(10) },
  phonePrefix: { fontSize: fontSize.md, fontWeight: '600', marginLeft: wp(8) },
  phoneSeparator: {
    width: 1, height: ms(24), backgroundColor: '#ddd', marginHorizontal: wp(8),
  },



  // Forgot password
  forgotPasswordText: { fontSize: fontSize.sm, fontWeight: '600', textAlign: 'right', marginBottom: hp(8) },

  // Remember me
  rememberRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: hp(16), gap: wp(8),
  },
  checkbox: {
    width: ms(22), height: ms(22), borderRadius: radius.sm,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  rememberText: { fontSize: fontSize.sm, fontWeight: '500' },

  // Button
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.lg, height: hp(56), gap: wp(8),
    paddingHorizontal: wp(20),
  },
  buttonText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700', letterSpacing: 0.5 },
  errorText: { fontSize: fontSize.sm, fontWeight: '500', textAlign: 'center' as const },

});
