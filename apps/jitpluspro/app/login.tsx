import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { getErrorMessage } from '@/utils/error';
import { isValidEmail } from '@/utils/validation';
import { Eye, EyeOff, Mail, ArrowRight, ChevronDown, WifiOff, TriangleAlert } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import BrandName from '@/components/BrandName';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';
import { AppleLogo } from '@/components/AppleLogo';
import { LinearGradient } from 'expo-linear-gradient';
import { GoogleLogo } from '@/components/GoogleLogo';
import { ActionButton } from '@/components/ui/ActionButton';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';

type LoginErrorType = 'none' | 'credentials' | 'generic';

const EMAIL_ANIM_DURATION = 250;

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loginErrorType, setLoginErrorType] = useState<LoginErrorType>('none');
  const [errorMessage, setErrorMessage] = useState('');
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [rateRemainingSec, setRateRemainingSec] = useState(0);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const [formMounted, setFormMounted] = useState(false);
  const [emailFormAnim] = useState(() => new Animated.Value(0));

  const [logoAnim] = useState(() => new Animated.Value(0));
  const [cardAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const anim = Animated.stagger(130, [
      Animated.spring(logoAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [logoAnim, cardAnim]);

  useEffect(() => {
    const applyOnline = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      setIsOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    };

    NetInfo.fetch().then(applyOnline).catch(() => {});
    const unsubscribe = NetInfo.addEventListener(applyOnline);
    return unsubscribe;
  }, []);

  // update() zeroes rateRemainingSec before clearing rateLimitedUntil, so no reset is needed here.
  useEffect(() => {
    if (!rateLimitedUntil) return;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
      setRateRemainingSec(remaining);
      if (remaining === 0) setRateLimitedUntil(null);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [rateLimitedUntil]);

  const canSubmit = isValidEmail(email) && password.length > 0;
  const isRateLimited = rateRemainingSec > 0;

  const clearCredentialError = useCallback(() => {
    if (loginErrorType === 'credentials') {
      setLoginErrorType('none');
      setErrorMessage('');
    }
  }, [loginErrorType]);

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

    setFormMounted(true);
    requestAnimationFrame(() => {
      Animated.timing(emailFormAnim, {
        toValue: 1,
        duration: EMAIL_ANIM_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setTimeout(() => {
            emailRef.current?.focus();
          }, 10);
        }
      });
    });
  }, [formMounted, emailFormAnim]);

  const closeEmailForm = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(emailFormAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFormMounted(false);
    });
  }, [emailFormAnim]);

  const handleEmailDisclosure = useCallback(() => {
    if (formMounted) closeEmailForm();
    else openEmailForm();
  }, [formMounted, closeEmailForm, openEmailForm]);

  const submitDisabled = isLoading || !canSubmit || !isOnline || isRateLimited;
  const submitIdle = submitDisabled && !isLoading;

  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    if (submitDisabled) return;

    setLoginErrorType('none');
    setErrorMessage('');

    const trimmedEmail = email.trim().toLowerCase();

    setIsLoading(true);
    try {
      // Keep session persistence enabled on mobile by default.
      await signIn({ email: trimmedEmail, password }, true);
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
        if (retryAfterMs && retryAfterMs > 0) {
          setRateLimitedUntil(Date.now() + retryAfterMs);
          setLoginErrorType('none');
          setErrorMessage('');
        } else {
          setLoginErrorType('generic');
          setErrorMessage(getErrorMessage(err, t('common.genericError')));
        }
      } else if (status === 401 || status === 400) {
        setLoginErrorType('credentials');
        setErrorMessage(t('login.invalidCredentialsGeneric'));
      } else if (isNetworkError) {
        const net = await NetInfo.fetch();
        setIsOnline(Boolean(net.isConnected) && net.isInternetReachable !== false);
        setLoginErrorType('generic');
        setErrorMessage(t('common.networkErrorMsg'));
      } else {
        setLoginErrorType('generic');
        setErrorMessage(getErrorMessage(err, t('login.invalidCredentials')));
      }
    } finally {
      setIsLoading(false);
    }
  }, [submitDisabled, email, password, signIn, router, t]);

  const hasCredentialError = loginErrorType === 'credentials';
  const showInlineError = loginErrorType !== 'none' && !!errorMessage;

  const rateMinutesLabel = Math.max(1, Math.ceil(rateRemainingSec / 60));

  const fieldStyle = useCallback((field: 'email' | 'password') => {
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
  }, [focusedField, hasCredentialError, dir.row, theme.inputBg, theme.inputBorder, theme.danger]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View pointerEvents="none" style={styles.glowBg} />

      <SafeAreaView edges={['top']} style={[styles.langBar, isRTL ? styles.langBarRtl : styles.langBarLtr]}>
        <View style={[styles.langRow, { flexDirection: dir.row }]}>
          {LANGUAGES.map(({ code, flag }) => {
            const active = locale === code;
            return (
              <TouchableOpacity
                key={code}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={code}
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

      <SafeAreaView style={styles.container} edges={['bottom']}>
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
            <Animated.View style={[
              styles.header,
              {
                opacity: logoAnim,
                transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
              },
            ]}>
              <View style={styles.logoMarkShadow}>
                <LinearGradient
                  colors={['#FFFFFF', '#FFFFFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoMark}
                >
                  <Image
                    source={require('@/assets/images/jitplusprologo.png')}
                    style={styles.logoMarkImage}
                    resizeMode="contain"
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.03)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </LinearGradient>
              </View>

              <BrandName fontSize={ms(27)} />
              <Text style={[styles.tagline, { color: theme.textMuted }]}>{t('login.appTagline')}</Text>
            </Animated.View>

            <Animated.View style={[
              styles.formSection,
              {
                opacity: cardAnim,
                transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              },
            ]}>
              <TouchableOpacity
                onPress={google.promptGoogle}
                disabled={google.isLoading || isLoading}
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
                  <ActivityIndicator color={palette.charbon} size="small" />
                ) : (
                  <>
                    <GoogleLogo size={ms(20)} />
                    <Text style={[styles.socialBtnText, { color: theme.text }]}>{t('login.loginWithGoogle')}</Text>
                  </>
                )}
              </TouchableOpacity>

              {Platform.OS === 'ios' && apple.isAvailable && (
                <TouchableOpacity
                  onPress={apple.promptApple}
                  disabled={apple.isLoading || isLoading}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={t('login.loginWithApple')}
                  style={[styles.socialBtn, styles.appleBtn, { flexDirection: dir.row }]}
                >
                  {apple.isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <AppleLogo size={ms(19)} color="#fff" />
                      <Text style={[styles.socialBtnText, styles.appleBtnText]}>{t('login.loginWithApple')}</Text>
                    </>
                  )}
                </TouchableOpacity>
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
                  <Text style={[styles.errorText, { color: theme.danger, textAlign: dir.textAlign }]}>{apple.error}</Text>
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

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.inputBorder }]} />
                <Text style={[styles.dividerText, { color: theme.textMuted }]}>{t('login.orDivider')}</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.inputBorder }]} />
              </View>

              <TouchableOpacity
                onPress={handleEmailDisclosure}
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
                <Animated.View
                  style={[
                    styles.chevronWrap,
                    { transform: [{ rotate: emailFormAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] },
                  ]}
                >
                  <ChevronDown size={ms(18)} color={palette.violet} strokeWidth={icon.stroke} />
                </Animated.View>
              </TouchableOpacity>

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

            {formMounted && (
              <Animated.View
                style={[
                  styles.formSection,
                  {
                    opacity: emailFormAnim,
                    transform: [
                      {
                        translateY: emailFormAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }),
                      },
                    ],
                  },
                ]}
              >
                {!isOnline && (
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
                )}

                {isRateLimited && (
                  <View
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={[styles.rateLimitBanner, { flexDirection: dir.row }]}
                  >
                    <TriangleAlert size={ms(15)} color="#92400E" strokeWidth={icon.stroke} />
                    <Text style={[styles.rateLimitText, { textAlign: dir.textAlign }]}>
                      {t('login.rateLimitedBanner', { minutes: rateMinutesLabel })}
                    </Text>
                  </View>
                )}

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
                      accessibilityState={{ checked: showPassword }}
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

                {showInlineError && (
                  <View
                    style={[styles.fieldErrorRow, { flexDirection: dir.row }]}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    <TriangleAlert size={ms(13)} color={theme.danger} strokeWidth={icon.strokeSmall} />
                    <Text style={[styles.fieldErrorText, { color: theme.danger, textAlign: dir.textAlign }]}>{errorMessage}</Text>
                  </View>
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
  return (
    <View style={[styles.noAccountBanner, { backgroundColor: `${palette.charbon}08`, borderColor: `${palette.charbon}25` }]}>
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

  glowBg: {
    position: 'absolute',
    top: -hp(96),
    left: '50%',
    marginLeft: -ms(170),
    width: ms(340),
    height: ms(340),
    borderRadius: ms(170),
    backgroundColor: 'rgba(124,58,237,0.10)',
  },

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

  header: {
    alignItems: 'center',
    marginBottom: hp(28),
  },
  logoMarkShadow: {
    borderRadius: radius.lg,
    marginBottom: hp(14),
    ...Platform.select({
      ios: {
        shadowColor: palette.violet,
        shadowOpacity: 0.42,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 7 },
    }),
  },
  logoMark: {
    width: ms(60),
    height: ms(60),
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoMarkImage: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  tagline: {
    marginTop: hp(5),
    fontSize: fontSize.sm,
    fontFamily: font.medium,
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
  appleBtnText: { color: '#fff' },
  socialBtnText: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(12),
    marginVertical: hp(16),
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
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
    color: '#92400E',
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
