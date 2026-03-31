import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { getErrorMessage } from '@/utils/error';
import { isValidEmail } from '@/utils/validation';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { Eye, EyeOff, Lock, Mail, ArrowRight, Check } from 'lucide-react-native';
import BrandName from '@/components/BrandName';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const { signIn } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const google = useGoogleAuth();

  // ── Entrance animations ──
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

  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      setError(t('login.fillAll'));
      return;
    }
    if (!emailValid) {
      setError(t('login.invalidEmail'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('login.passwordTooShort', { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    setIsLoading(true);
    try {
      await signIn({ email: trimmedEmail, password }, rememberMe);
      router.replace('/scan-qr');
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('login.invalidCredentials'));
      if (msg.includes('réseau') || msg.includes('network')) Alert.alert(t('common.networkError'), msg);
      else setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [email, password, rememberMe, emailValid, signIn, router, t]);

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
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
            <Animated.View style={[styles.header, {
              opacity: logoAnim,
              transform: [{
                scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
              }],
            }]}>
              <View style={styles.brandRow}>
                <Image
                  source={require('@/assets/images/jitplusprologo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
                <BrandName fontSize={28} />
              </View>
              <Text style={[styles.tagline, { color: theme.textMuted }]}>{t('login.appTagline')}</Text>
            </Animated.View>

            {/* ── Google Sign-In ── */}
            <Animated.View style={[styles.formSection, {
              opacity: cardAnim,
              transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
            }]}>
              <TouchableOpacity
                onPress={google.promptGoogle}
                disabled={google.isLoading || isLoading}
                activeOpacity={0.85}
                style={[styles.googleBtn, {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                }]}
              >
                {google.isLoading ? (
                  <ActivityIndicator color={palette.charbon} size="small" />
                ) : (
                  <>
                    <View style={styles.googleIconWrap}>
                      <Text style={styles.googleG}>G</Text>
                    </View>
                    <Text style={[styles.googleBtnText, { color: theme.text }]}>
                      {t('login.loginWithGoogle')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Google error */}
              {!!google.error && !google.noAccount && (
                <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                  <Text style={[styles.errorText, { color: theme.danger }]}>{google.error}</Text>
                </View>
              )}

              {/* Google no-account banner — guide user to register */}
              {google.noAccount && (
                <View style={[styles.noAccountBanner, { backgroundColor: `${palette.charbon}08`, borderColor: `${palette.charbon}25` }]}>
                  <Text style={[styles.noAccountTitle, { color: theme.text }]}>
                    {t('googleAuth.noAccountTitle')}
                  </Text>
                  <Text style={[styles.noAccountMsg, { color: theme.textMuted }]}>
                    {t('googleAuth.noAccountAction')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      google.dismissNoAccount();
                      router.push('/register');
                    }}
                    activeOpacity={0.85}
                    style={[styles.noAccountBtn, { backgroundColor: palette.charbon }]}
                  >
                    <Text style={styles.noAccountBtnText}>{t('googleAuth.goToRegister')}</Text>
                    <ArrowRight size={ms(16)} color="#fff" strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>
              )}

              {/* ── OR Divider ── */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.inputBorder }]} />
                <Text style={[styles.dividerText, { color: theme.textMuted }]}>{t('login.orDivider')}</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.inputBorder }]} />
              </View>
            </Animated.View>

            {/* ── Email Form ── */}
            <Animated.View style={[styles.formSection, {
              opacity: cardAnim,
              transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
            }]}>
              {/* Email input */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: error ? theme.danger : emailValid ? palette.charbon : theme.inputBorder,
                  borderWidth: emailValid ? 2 : 1.5,
                }]}>
                  <Mail size={ms(18)} color={emailValid ? palette.charbon : theme.inputPlaceholder} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.inputField, { color: theme.text }]}
                    placeholder={t('login.emailPlaceholder')}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setError(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    returnKeyType="next"
                    editable={!isLoading}
                  />
                </View>
              </View>

              {/* Password input */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: error ? theme.danger : password.length >= MIN_PASSWORD_LENGTH ? palette.charbon : theme.inputBorder,
                  borderWidth: password.length >= MIN_PASSWORD_LENGTH ? 2 : 1.5,
                }]}>
                  <Lock size={ms(18)} color={password.length >= MIN_PASSWORD_LENGTH ? palette.charbon : theme.inputPlaceholder} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.inputField, { color: theme.text }]}
                    placeholder={t('login.passwordPlaceholder')}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setError(''); }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((p) => !p)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {showPassword
                      ? <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                      : <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                    }
                  </TouchableOpacity>
                </View>
              </View>

              {/* Error */}
              {!!error && (
                <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                  <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
                </View>
              )}

              {/* Forgot password */}
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/forgot-password')}>
                <Text style={[styles.forgotText, { color: palette.charbon }]}>{t('login.forgotPassword')}</Text>
              </TouchableOpacity>

              {/* Remember me */}
              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, {
                  borderColor: rememberMe ? palette.charbon : theme.inputBorder,
                  backgroundColor: rememberMe ? palette.charbon : 'transparent',
                }]}>
                  {rememberMe && <Check size={ms(14)} color="#fff" strokeWidth={3} />}
                </View>
                <Text style={[styles.rememberText, { color: theme.text }]}>{t('login.rememberMe')}</Text>
              </TouchableOpacity>

              {/* Submit */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.85}
                style={[styles.button, {
                  backgroundColor: emailValid && password.length >= MIN_PASSWORD_LENGTH ? palette.charbon : '#D4D0E8',
                }]}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={[styles.buttonText, {
                      opacity: emailValid && password.length >= MIN_PASSWORD_LENGTH ? 1 : 0.5,
                    }]}>{t('login.loginBtn')}</Text>
                    <ArrowRight size={ms(18)} color={emailValid && password.length >= MIN_PASSWORD_LENGTH ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Footer ── */}
        <Animated.View style={[styles.footerContainer, { opacity: footerAnim }]}>
          <Text style={[styles.footerText, { color: theme.textMuted }]}>{t('login.noAccount')}{' '}</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/register')}>
            <Text style={[styles.footerLink, { color: palette.charbon }]}>{t('login.register')}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Language Selector ── */}
        <Animated.View style={[styles.langRow, { opacity: footerAnim }]}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              onPress={() => setLocale(lang.code)}
              style={[
                styles.langPill,
                {
                  backgroundColor: locale === lang.code ? `${palette.charbon}18` : 'transparent',
                  borderColor: locale === lang.code ? palette.charbon : theme.inputBorder,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={styles.langFlag}>{lang.flag}</Text>
              <Text style={[styles.langLabel, { color: locale === lang.code ? palette.charbon : theme.textMuted }]}>
                {lang.nativeLabel}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(24),
    paddingVertical: hp(20),
  },

  // Logo
  header: { alignItems: 'center', marginBottom: hp(32) },
  brandRow: { flexDirection: 'column', alignItems: 'center', gap: ms(6) },
  logoImage: { width: ms(80), height: ms(80), borderRadius: ms(20) },
  tagline: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: hp(4),
  },

  // Form
  formSection: { paddingHorizontal: wp(4) },

  // Google button
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    height: hp(56),
    borderWidth: 1.5,
    gap: wp(10),
    marginBottom: hp(8),
  },
  googleIconWrap: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
    }),
  },
  googleG: {
    fontSize: ms(17),
    fontWeight: '700',
    color: '#4285F4',
  },
  googleBtnText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: hp(16),
    gap: wp(12),
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Input
  inputContainer: { marginBottom: hp(16) },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    height: hp(58),
  },
  inputField: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
    marginLeft: wp(10),
  },

  // Error
  errorBanner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: hp(12),
  },
  errorText: { fontSize: 13 },

  // No-account banner (Google login → user doesn't exist yet)
  noAccountBanner: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    marginBottom: hp(12),
    gap: hp(6),
  },
  noAccountTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  noAccountMsg: {
    fontSize: fontSize.sm,
    lineHeight: ms(20),
  },
  noAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    height: hp(42),
    gap: wp(6),
    marginTop: hp(6),
  },
  noAccountBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // Forgot password
  forgotText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: hp(8),
  },

  // Remember me
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(16),
    gap: wp(8),
  },
  checkbox: {
    width: ms(22),
    height: ms(22),
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberText: { fontSize: fontSize.sm, fontWeight: '500' },

  // Button
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    height: hp(56),
    gap: wp(8),
    paddingHorizontal: wp(20),
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Footer
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: hp(12),
    paddingBottom: hp(8),
  },
  footerText: { fontSize: fontSize.sm },
  footerLink: { fontSize: fontSize.sm, fontWeight: '700' },

  // Language selector
  langRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: hp(16),
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  langFlag: { fontSize: 16 },
  langLabel: { fontSize: 13 },
});
