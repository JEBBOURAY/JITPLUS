import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  ScrollView,
  Linking,
  AccessibilityInfo,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as IntentLauncher from 'expo-intent-launcher';
import { Text, TextInput } from '@/components/AppText';
import { goHomeAfterLogin } from '@/services/pendingDeal';
import { flagHomeWelcome } from '@/hooks/useHomeBanners';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import BrandText from '@/components/BrandText';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius, SCREEN } from '@/utils/responsive';
import FormError from '@/components/FormError';
import LoginBackdrop from '@jitplus/shared/src/login/LoginBackdrop';
import StarLoader from '@/components/StarLoader';
import { useFocusAfterTransition } from '@/hooks/useFocusAfterTransition';
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SPRING_SMOOTH, rnSpring } from '@/utils/motion';
import { hapticError } from '@/utils/haptics';
import { DIR_FLIP } from '@/utils/rtl';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const OTP_LENGTH = 6;
const RESEND_DELAY_S = 60;
// Shown to the user; mirrors CLIENT_OTP_EXPIRY_MS on the server.
const CODE_VALID_MIN = 10;
// The server dropped the code: only a new one can work, so the resend opens at once.
const DEAD_CODE_ERRORS = new Set([
  'error.auth.otpExpired', 'error.auth.otpTooManyAttempts', 'error.auth.otpNotSentEmail', 'error.auth.otpAlreadyUsed',
]);

const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

// Opens the inbox to read the code. iOS: Apple Mail. Android: the default mail
// app (Gmail, Outlook…), in its own task so Back returns to JitPlus's code screen.
const openMailApp = () => {
  if (Platform.OS === 'ios') {
    Linking.openURL('message://').catch(() => {});
    return;
  }
  IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
    category: 'android.intent.category.APP_EMAIL',
    flags: FLAG_ACTIVITY_NEW_TASK,
  }).catch(() => {});
};


export default function VerifyOtpScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { telephone, isRegister, isForgotPassword } = useLocalSearchParams<{ telephone: string; isRegister?: string; isForgotPassword?: string }>();
  const { verifyOtpEmail, verifyOtpForReset, sendOtpEmail } = useAuth();
  const isRegisterFlow = isRegister === '1';
  const isForgotPasswordFlow = isForgotPassword === '1';
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<TextInput>(null);
  useFocusAfterTransition(inputRef);
  // The server limits attempts per code; a local counter would also block fresh codes.
  const verifyingRef = useRef(false);
  // No answer from the server: the code stays on screen with a "Retry" link.
  const [networkFailed, setNetworkFailed] = useState(false);
  // A new key remounts the resend line with its countdown at `wait` seconds.
  const [resend, setResend] = useState({ key: 0, wait: RESEND_DELAY_S });

  // Animations
  const [headerAnim] = useState(() => new Animated.Value(0));
  const [cardAnim] = useState(() => new Animated.Value(0));

  const reduceMotion = useReducedMotion();
  // Rejected code: the row shakes (no shake under reduced motion) and an error haptic fires.
  const shakeX = useSharedValue(0);
  const rejectCode = useCallback(() => {
    hapticError();
    if (reduceMotion) return;
    shakeX.set(withSequence(
      withTiming(-6, { duration: 50 }),
      withTiming(6, { duration: 60 }),
      withTiming(-4, { duration: 60 }),
      withTiming(4, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    ));
  }, [reduceMotion, shakeX]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.get() }] }));

  useEffect(() => {
    if (reduceMotion) {
      headerAnim.setValue(1);
      cardAnim.setValue(1);
      return;
    }
    const anim = Animated.stagger(200, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [headerAnim, cardAnim, reduceMotion]);

  // Checks `value` with the server. Called when the sixth digit arrives (typed,
  // autofilled or pasted) and by "Retry".
  const verify = useCallback(async (value: string) => {
    if (value.length !== OTP_LENGTH || !telephone || verifyingRef.current) return;

    verifyingRef.current = true;
    setIsLoading(true);
    setError('');
    setNetworkFailed(false);

    const result = isForgotPasswordFlow
      ? await verifyOtpForReset(telephone, value)
      : await verifyOtpEmail(telephone, value, isRegisterFlow);
    setIsLoading(false);
    verifyingRef.current = false;

    if (!result.success) {
      // No answer from the server: the code is not wrong, keep it and offer to retry.
      if (result.isNetworkError) {
        setError(result.error || t('common.networkError'));
        setNetworkFailed(true);
        return;
      }
      // Server returns remaining attempts in the error message
      setError(result.error || t('verifyOtp.invalidCode'));
      setCode('');
      rejectCode();
      if (result.code && DEAD_CODE_ERRORS.has(result.code)) setResend((r) => ({ key: r.key + 1, wait: 0 }));
      return;
    }
    if (isForgotPasswordFlow) {
      router.replace('/set-password');
    } else if ('isNewUser' in result && result.isNewUser) {
      router.push({
        pathname: '/complete-profile',
        params: { needsPassword: 'needsPassword' in result && result.needsPassword ? '1' : '0' },
      });
    } else {
      await flagHomeWelcome('back');
      goHomeAfterLogin(router);
    }
  }, [telephone, isRegisterFlow, isForgotPasswordFlow, verifyOtpEmail, verifyOtpForReset, t, rejectCode]);

  const enterCode = useCallback((value: string) => {
    setCode(value);
    setNetworkFailed(false);
    void verify(value);
  }, [verify]);

  const handleResend = useCallback(async () => {
    if (!telephone) return false;
    setError('');
    const result = await sendOtpEmail(telephone, isRegisterFlow);
    if (!result.success) setError(result.error || t('verifyOtp.resendError'));
    // The digits already typed belong to the previous code, which no longer works.
    else {
      setCode('');
      if (isRegisterFlow) api.trackSignup('code_resent', 'email');
    }
    return result.success;
  }, [telephone, isRegisterFlow, sendOtpEmail, t]);

  // The input is invisible, so iOS never shows its "Paste" menu. Also accepts
  // a whole copied line ("123456 is your code").
  const handlePaste = useCallback(async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const digits = text.replace(/\D/g, '');
    const pasted = text.match(/(?<!\d)\d{6}(?!\d)/)?.[0] ?? (digits.length === OTP_LENGTH ? digits : null);
    if (!pasted) {
      setError(t('verifyOtp.pasteNone'));
      return;
    }
    enterCode(pasted);
  }, [t, enterCode]);

  // Responsive OTP box size
  const codeBoxSize = SCREEN.isSmall ? ms(40) : ms(46);
  const codeBoxHeight = SCREEN.isSmall ? ms(50) : ms(56);
  const codeGap = SCREEN.isSmall ? wp(6) : wp(10);

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <LoginBackdrop dark={theme.mode === 'dark'} />
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.bgElevated, borderColor: theme.border }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(22)} color={theme.text} style={DIR_FLIP} />
        </TouchableOpacity>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          <Animated.View style={[styles.header, {
            opacity: headerAnim,
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: reduceMotion ? [0, 0] : [-30, 0] }) }],
          }]}>
            <View style={styles.shieldIcon}>
              <Image
                source={require('@/assets/images/jitpluslogo-app.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <BrandText size={16} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{isForgotPasswordFlow ? t('verifyOtp.resetTitle') : t('verifyOtp.verifyTitle')}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {t('verifyOtp.codeSentTo')}{' '}{'\n'}
              <Text style={[styles.phone, { color: theme.text }]}>{telephone || ''}</Text>
              {'\n'}{t('verifyOtp.validFor', { minutes: CODE_VALID_MIN })}
            </Text>
            {/* Back keeps the typed address on the previous screen. */}
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.headerLink}>{t('verifyOtp.changeEmail')}</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.card, {
            backgroundColor: theme.bgCard,
            opacity: cardAnim,
            transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: reduceMotion ? [0, 0] : [40, 0] }) }],
          }]}>
            <Reanimated.View style={shakeStyle}>
            <TouchableOpacity
              style={[styles.codeContainer, { gap: codeGap }]}
              activeOpacity={1}
              onPress={() => inputRef.current?.focus()}
            >
              {Array.from({ length: OTP_LENGTH }).map((_, index) => {
                const isFocused = index === code.length;
                const isFilled = !!code[index];
                return (
                  <View
                    key={index}
                    style={[
                      styles.codeBox,
                      {
                        width: codeBoxSize,
                        height: codeBoxHeight,
                        backgroundColor: isFilled ? `${palette.violet}08` : theme.bgInput,
                        borderColor: isFocused ? palette.violet : isFilled ? palette.violetLight : theme.border,
                        borderWidth: isFocused ? 2.5 : 1.5,
                        transform: [{ scale: isFocused ? 1.05 : 1 }],
                      },
                    ]}
                  >
                    <Text style={[styles.codeDigit, { color: theme.text }]}>
                      {code[index] || ''}
                    </Text>
                    {isFocused && <View style={[styles.cursor, { backgroundColor: palette.violet }]} />}
                  </View>
                );
              })}
            </TouchableOpacity>
            </Reanimated.View>

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={(text) => enterCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              accessibilityLabel={`${t('verifyOtp.codeSentTo')} ${telephone || ''}`}
            />

            {!isLoading && (
              <TouchableOpacity onPress={handlePaste} accessibilityRole="button" hitSlop={8} style={styles.pasteLink}>
                <Text style={styles.headerLink}>{t('verifyOtp.pasteCode')}</Text>
              </TouchableOpacity>
            )}

            <FormError message={error} />

            {networkFailed && !isLoading && (
              <TouchableOpacity onPress={() => verify(code)} accessibilityRole="button" hitSlop={8} style={styles.retryLink}>
                <Text style={styles.headerLink}>{t('common.retry')}</Text>
              </TouchableOpacity>
            )}

            {isLoading && (
              <View style={styles.loadingContainer}>
                <StarLoader size={88} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                  {t('verifyOtp.verifying')}
                </Text>
              </View>
            )}

            <TouchableOpacity onPress={openMailApp} accessibilityRole="button" hitSlop={8} style={styles.mailHelp}>
              <Text style={styles.headerLink}>{t('verifyOtp.openMail')}</Text>
            </TouchableOpacity>

            <ResendCode key={resend.key} initialSeconds={resend.wait} onResend={handleResend} />

            {/* Login by code: an address without an account gets no code either. */}
            {!isRegisterFlow && !isForgotPasswordFlow && (
              <View style={styles.existingAccount}>
                <Text style={[styles.existingAccountText, { color: theme.textMuted }]}>
                  {t('verifyOtp.noAccountHint')}
                </Text>
                <TouchableOpacity onPress={() => router.replace('/register')} accessibilityRole="link">
                  <Text style={styles.existingAccountLink}>{t('verifyOtp.goToRegister')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* An email that already has an account gets no code (nothing reveals it exists). */}
            {isRegisterFlow && (
              <View style={styles.existingAccount}>
                <Text style={[styles.existingAccountText, { color: theme.textMuted }]}>
                  {t('verifyOtp.existingAccountHint')}
                </Text>
                <TouchableOpacity onPress={() => router.dismissTo('/login')} accessibilityRole="link">
                  <Text style={styles.existingAccountLink}>{t('verifyOtp.goToLogin')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/**
 * Resend link with its countdown. Kept apart so the 1 s tick re-renders this
 * line only, not the whole screen.
 */
const ResendCode = memo(function ResendCode({ onResend, initialSeconds }: { onResend: () => Promise<boolean>; initialSeconds: number }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [seconds, setSeconds] = useState(initialSeconds);
  const waiting = seconds > 0;
  // Confirms a resend until the next one becomes possible.
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  // A double tap sent twice: the second request came back "wait a minute" and showed an error.
  const sendingRef = useRef(false);
  const handlePress = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      if (await onResend()) {
        setSeconds(RESEND_DELAY_S);
        setResent(true);
        AccessibilityInfo.announceForAccessibility(t('verifyOtp.codeResent'));
      }
    } finally {
      sendingRef.current = false;
    }
  }, [onResend, t]);

  return (
    <View style={styles.resendContainer}>
      <Text style={[styles.resendText, { color: resent && waiting ? theme.success : theme.textMuted }]}>
        {resent && waiting ? t('verifyOtp.codeResent') : t('verifyOtp.checkSpam')}
      </Text>
      <TouchableOpacity onPress={handlePress} disabled={waiting} accessibilityRole="button" accessibilityState={{ disabled: waiting }}>
        <Text style={[styles.resendButton, { color: waiting ? theme.textMuted : palette.violet }]}>
          {waiting ? t('verifyOtp.resendTimer', { seconds }) : t('verifyOtp.resendCode')}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },

  backButton: {
    width: ms(44), height: ms(44), borderRadius: ms(22),
    justifyContent: 'center', alignItems: 'center',
    marginLeft: wp(16), marginTop: hp(8),
    borderWidth: 1,
  },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: wp(24) },

  header: { alignItems: 'center', marginBottom: hp(36) },
  shieldIcon: {
    flexDirection: 'row',
    paddingHorizontal: ms(16), height: ms(56), borderRadius: ms(28),
    backgroundColor: palette.violetUltraLight,
    borderWidth: 2, borderColor: palette.violetSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(16),
    gap: ms(6),
  },
  logoImage: { width: ms(32), height: ms(32) },
  title: { fontSize: fontSize['3xl'], fontWeight: '600', marginBottom: hp(10), letterSpacing: -0.3 },
  subtitle: { fontSize: fontSize.md, textAlign: 'center', lineHeight: ms(24) },
  phone: { fontWeight: '600' },
  headerLink: { fontSize: fontSize.sm, fontWeight: '600', color: palette.violet, marginTop: hp(8), textAlign: 'center' },
  mailHelp: { alignItems: 'center', marginBottom: hp(16) },
  retryLink: { alignSelf: 'center', marginBottom: hp(16) },
  pasteLink: { alignSelf: 'center', marginTop: -hp(16), marginBottom: hp(16) },

  card: {
    borderRadius: radius['2xl'], padding: wp(28),
    shadowColor: '#000', shadowOffset: { width: 0, height: hp(4) },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 8,
  },
  codeContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: hp(24) },
  codeBox: { borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  codeDigit: { fontSize: fontSize['2xl'], fontWeight: '600' },
  cursor: { position: 'absolute', bottom: hp(10), width: wp(18), height: 2.5, borderRadius: 2 },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },

  loadingContainer: { alignItems: 'center', marginBottom: hp(16) },
  loadingText: { marginTop: hp(12), fontSize: fontSize.sm },

  resendContainer: { alignItems: 'center', gap: hp(8) },
  resendText: { fontSize: fontSize.sm, textAlign: 'center' },
  resendButton: { fontSize: fontSize.md, fontWeight: '600' },

  // A tinted box: a code that never comes is the first thing people get stuck on.
  existingAccount: {
    alignItems: 'center', gap: hp(4), marginTop: hp(20),
    paddingVertical: hp(12), paddingHorizontal: wp(14), borderRadius: radius.md,
    backgroundColor: `${palette.violet}14`,
  },
  existingAccountText: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20) },
  existingAccountLink: { fontSize: fontSize.sm, fontWeight: '600', color: palette.violet },
});
