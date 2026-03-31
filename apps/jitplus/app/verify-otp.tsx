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
  Animated,
  Image,
  ScrollView,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import BrandText from '@/components/BrandText';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius, SCREEN } from '@/utils/responsive';
import FormError from '@/components/FormError';

const OTP_LENGTH = 6;

export default function VerifyOtpScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { telephone, isEmail, isRegister, isForgotPassword } = useLocalSearchParams<{ telephone: string; isEmail?: string; isRegister?: string; isForgotPassword?: string }>();
  const { verifyOtp, sendOtp, verifyOtpEmail, sendOtpEmail } = useAuth();
  const isEmailFlow = isEmail === '1';
  const isRegisterFlow = isRegister === '1';
  const isForgotPasswordFlow = isForgotPassword === '1';
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const inputRef = useRef<TextInput>(null);
  const verifyingRef = useRef(false);
  /** Client-side brute-force protection: cooldown between OTP attempts */
  const attemptCountRef = useRef(0);
  const lastAttemptRef = useRef(0);
  const lockoutUntilRef = useRef(0);
  const MAX_ATTEMPTS = 5;
  const COOLDOWN_MS = 5000; // 5 seconds between attempts
  const LOCKOUT_MS = 2 * 60 * 1000; // 2-minute lockout after max attempts

  // Animations
  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.stagger(200, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    anim.start();
    return () => anim.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVerify = useCallback(async () => {
    if (code.length !== OTP_LENGTH || !telephone || verifyingRef.current) return;

    // Client-side brute-force protection
    const now = Date.now();
    if (lockoutUntilRef.current > now) {
      const secsLeft = Math.ceil((lockoutUntilRef.current - now) / 1000);
      setError(t('verifyOtp.tooManyAttempts') + ` (${secsLeft}s)`);
      setCode('');
      return;
    }
    if (now - lastAttemptRef.current < COOLDOWN_MS) {
      setError(t('verifyOtp.tooFast'));
      setCode('');
      return;
    }
    if (attemptCountRef.current >= MAX_ATTEMPTS) {
      lockoutUntilRef.current = now + LOCKOUT_MS;
      attemptCountRef.current = 0; // reset counter for after lockout
      setError(t('verifyOtp.tooManyAttempts'));
      setCode('');
      return;
    }
    attemptCountRef.current += 1;
    lastAttemptRef.current = now;

    verifyingRef.current = true;
    setIsLoading(true);
    setError('');

    const result = isEmailFlow
      ? await verifyOtpEmail(telephone, code, isRegisterFlow)
      : await verifyOtp(telephone, code, isRegisterFlow);
    setIsLoading(false);
    verifyingRef.current = false;

    if (result.success) {
      if (isForgotPasswordFlow) {
        // Forgot password: user is now authenticated via OTP, go to set new password
        router.replace('/set-password');
      } else if (result.isNewUser) {
        router.push({
          pathname: '/complete-profile',
          params: { needsPassword: '1' },
        });
      } else {
        await AsyncStorage.setItem('showWelcome', '1');
        router.replace('/(tabs)/qr');
      }
    } else {
      // Server returns remaining attempts in the error message
      setError(result.error || t('verifyOtp.invalidCode'));
      setCode('');
    }
  }, [code, telephone, isEmailFlow, isRegisterFlow, isForgotPasswordFlow, verifyOtp, verifyOtpEmail, t]);

  useEffect(() => {
    if (code.length === OTP_LENGTH && !isLoading) {
      handleVerify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, handleVerify]);

  const handleResend = async () => {
    if (resendTimer > 0 || !telephone) return;
    setResendTimer(60);
    setError('');
    const result = isEmailFlow
      ? await sendOtpEmail(telephone, isRegisterFlow)
      : await sendOtp(telephone, isRegisterFlow);
    if (!result.success) {
      setError(result.error || t('verifyOtp.resendError'));
    }
  };

  const formatPhone = (phone: string) => {
    return phone.replace(/(\d{2})(?=\d)/g, '$1 ');
  };

  // Responsive OTP box size
  const codeBoxSize = SCREEN.isSmall ? ms(40) : ms(46);
  const codeBoxHeight = SCREEN.isSmall ? ms(50) : ms(56);
  const codeGap = SCREEN.isSmall ? wp(6) : wp(10);

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bgCard }]}>
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.bgElevated, borderColor: theme.border }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(22)} color={theme.text} />
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
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
          }]}>
            <View style={styles.shieldIcon}>
              <Image
                source={require('@/assets/images/jitpluslogo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <BrandText size={16} />
            </View>
            <Text style={styles.title}>{isForgotPasswordFlow ? t('verifyOtp.resetTitle') : t('verifyOtp.verifyTitle')}</Text>
            <Text style={styles.subtitle}>
              {isEmailFlow ? t('verifyOtp.codeSentTo') : t('verifyOtp.codeSentVia')}{' '}{'\n'}
              <Text style={styles.phone}>{isEmailFlow ? (telephone || '') : formatPhone(telephone || '')}</Text>
            </Text>
          </Animated.View>

          <Animated.View style={[styles.card, {
            backgroundColor: theme.bgCard,
            opacity: cardAnim,
            transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          }]}>
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

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              keyboardType="number-pad"
              autoFocus
              maxLength={OTP_LENGTH}
            />

            <FormError message={error} />

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                  {t('verifyOtp.verifying')}
                </Text>
              </View>
            )}

            <View style={styles.resendContainer}>
              <Text style={[styles.resendText, { color: theme.textMuted }]}>
                {t('verifyOtp.noCodeReceived')}
              </Text>
              <TouchableOpacity onPress={handleResend} disabled={resendTimer > 0}>
                <Text
                  style={[
                    styles.resendButton,
                    { color: resendTimer > 0 ? theme.textMuted : palette.violet },
                  ]}
                >
                  {resendTimer > 0 ? t('verifyOtp.resendTimer', { seconds: resendTimer }) : t('verifyOtp.resendCode')}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

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
  title: { fontSize: fontSize['3xl'], fontWeight: '700', color: palette.gray900, marginBottom: hp(10), letterSpacing: -0.3 },
  subtitle: { fontSize: fontSize.md, color: palette.gray500, textAlign: 'center', lineHeight: ms(24) },
  phone: { fontWeight: '700', color: palette.gray900 },

  card: {
    borderRadius: radius['2xl'], padding: wp(28),
    shadowColor: '#000', shadowOffset: { width: 0, height: hp(4) },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 8,
  },
  codeContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: hp(24) },
  codeBox: { borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  codeDigit: { fontSize: fontSize['2xl'], fontWeight: '700' },
  cursor: { position: 'absolute', bottom: hp(10), width: wp(18), height: 2.5, borderRadius: 2 },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },



  loadingContainer: { alignItems: 'center', marginBottom: hp(16) },
  loadingText: { marginTop: hp(12), fontSize: fontSize.sm },

  resendContainer: { alignItems: 'center', gap: hp(8) },
  resendText: { fontSize: fontSize.sm },
  resendButton: { fontSize: fontSize.md, fontWeight: '700' },
});
