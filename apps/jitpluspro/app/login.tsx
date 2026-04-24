import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
import { Eye, EyeOff, Lock, Mail, ArrowRight, Check, Store, Gift, X } from 'lucide-react-native';
import BrandName from '@/components/BrandName';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';
import { AppleLogo } from '@/components/AppleLogo';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [trialDismissed, setTrialDismissed] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const google = useGoogleAuth();
  const apple = useAppleAuth();
  const passwordRef = useRef<TextInput>(null);

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

  const emailValid = useMemo(() => isValidEmail(email), [email]);
  const passwordValid = useMemo(() => password.length >= MIN_PASSWORD_LENGTH, [password]);
  const canSubmit = emailValid && passwordValid;

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
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const axiosErr = err as { isAxiosError?: boolean; code?: string; response?: { status?: number }; message?: string };
      const isNetworkError = axiosErr?.isAxiosError && (axiosErr?.code === 'ECONNABORTED' || axiosErr?.code === 'ERR_NETWORK' || !axiosErr?.response);
      if (isNetworkError) {
        Alert.alert(t('common.networkError'), t('common.networkErrorMsg'));
      } else {
        const msg = getErrorMessage(err, t('login.invalidCredentials'));
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [email, password, rememberMe, emailValid, signIn, router, t]);

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.container}>
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

              {/* Trial badge */}
              {!trialDismissed && (
                <View style={[styles.trialBadge, { backgroundColor: `${palette.violet}10`, borderColor: `${palette.violet}30` }]}>
                  <Gift size={ms(16)} color={palette.violet} />
                  <Text style={[styles.trialBadgeText, { color: palette.violet }]}>
                    {t('registerExtra.trialBadge')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setTrialDismissed(true)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.6}
                  >
                    <X size={ms(16)} color={palette.violet} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              )}
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

              {/* Apple Sign-In — iOS only */}
              {apple.isAvailable && (
                <TouchableOpacity
                  onPress={apple.promptApple}
                  disabled={apple.isLoading || isLoading}
                  activeOpacity={0.85}
                  style={[styles.googleBtn, {
                    backgroundColor: '#000',
                    borderColor: '#000',
                    marginTop: hp(8),
                  }]}
                >
                  {apple.isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <AppleLogo size={ms(20)} color="#fff" />
                      <Text style={[styles.googleBtnText, { color: '#fff' }]}>
                        {t('login.loginWithApple')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Google error */}
              {!!google.error && !google.noAccount && (
                <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                  <Text style={[styles.errorText, { color: theme.danger }]}>{getErrorMessage(google.error, t('common.genericError'))}</Text>
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

              {/* Apple error */}
              {!!apple.error && !apple.noAccount && (
                <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                  <Text style={[styles.errorText, { color: theme.danger }]}>{apple.error}</Text>
                </View>
              )}

              {/* Apple no-account banner */}
              {apple.noAccount && (
                <View style={[styles.noAccountBanner, { backgroundColor: `${palette.charbon}08`, borderColor: `${palette.charbon}25` }]}>
                  <Text style={[styles.noAccountTitle, { color: theme.text }]}>
                    {t('appleAuth.noAccountTitle')}
                  </Text>
                  <Text style={[styles.noAccountMsg, { color: theme.textMuted }]}>
                    {t('appleAuth.noAccountAction')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      apple.dismissNoAccount();
                      router.push('/register');
                    }}
                    activeOpacity={0.85}
                    style={[styles.noAccountBtn, { backgroundColor: palette.charbon }]}
                  >
                    <Text style={styles.noAccountBtnText}>{t('appleAuth.noAccountTitle')}</Text>
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
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!isLoading}
                  />
                </View>
              </View>

              {/* Password input */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: error ? theme.danger : passwordValid ? palette.charbon : theme.inputBorder,
                  borderWidth: passwordValid ? 2 : 1.5,
                }]}>
                  <Lock size={ms(18)} color={passwordValid ? palette.charbon : theme.inputPlaceholder} strokeWidth={1.5} />
                  <TextInput
                    ref={passwordRef}
                    style={[styles.inputField, { color: theme.text }]}
                    placeholder={t('login.passwordPlaceholder')}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setError(''); }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    textContentType="password"
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
                disabled={!canSubmit || isLoading}
                activeOpacity={0.85}
                style={[styles.button, {
                  backgroundColor: canSubmit ? palette.charbon : `${palette.charbon}30`,
                }]}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={[styles.buttonText, {
                      opacity: canSubmit ? 1 : 0.5,
                    }]}>{t('login.loginBtn')}</Text>
                    <ArrowRight size={ms(18)} color={canSubmit ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Footer ── */}
        <Animated.View style={[styles.footerContainer, { opacity: footerAnim, paddingHorizontal: wp(24) }]}>
          <TouchableOpacity 
            activeOpacity={0.8} 
            onPress={() => router.push('/register')}
            style={[
              styles.registerProminentBtn, 
              { 
                backgroundColor: `${palette.violet}10`, 
                borderColor: `${palette.violet}30` 
              }
            ]}
          >
            <View style={[styles.storeIconWrap, { backgroundColor: palette.violet }]}>
              <Store size={ms(18)} color="#fff" />
            </View>
            <View style={styles.registerTextWrap}>
              <Text style={[styles.registerProminentTitle, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {t('login.noAccount')}
              </Text>
              <Text style={[styles.registerProminentSub, { color: palette.violet }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {t('register.subtitle')}
              </Text>
            </View>
            <ArrowRight size={ms(18)} color={palette.violet} strokeWidth={2} style={{ flexShrink: 0 }} />
          </TouchableOpacity>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex1: { flex: 1 },
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
    fontFamily: 'Lexend_500Medium',
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    paddingVertical: hp(8),
    marginTop: hp(12),
  },
  trialBadgeText: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

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
    fontFamily: 'Lexend_600SemiBold',
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
    fontFamily: 'Lexend_500Medium',
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
    fontFamily: 'Lexend_500Medium',
  },

  // Error
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    marginBottom: hp(12),
  },
  errorText: { fontSize: fontSize.xs, fontFamily: 'Lexend_400Regular' },

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
    fontFamily: 'Lexend_700Bold',
  },
  noAccountMsg: {
    fontSize: fontSize.sm,
    lineHeight: ms(20),
    fontFamily: 'Lexend_400Regular',
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
    fontFamily: 'Lexend_700Bold',
  },

  // Forgot password
  forgotText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: hp(8),
    fontFamily: 'Lexend_600SemiBold',
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
  rememberText: { fontSize: fontSize.sm, fontWeight: '500', fontFamily: 'Lexend_500Medium' },

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
    fontFamily: 'Lexend_700Bold',
  },

  // Footer
  footerContainer: {
    paddingBottom: hp(16),
    paddingTop: hp(8),
    alignItems: 'center',
    width: '100%',
  },
  registerProminentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: wp(14),
    borderRadius: radius.xl,
    borderWidth: 1.5,
    width: '100%',
  },
  storeIconWrap: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerProminentTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: 2,
    fontFamily: 'Lexend_700Bold',
  },
  registerProminentSub: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  registerTextWrap: {
    flex: 1,
    marginHorizontal: wp(10),
  },
});
