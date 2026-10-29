import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Mail, ShieldCheck, RefreshCw } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDir } from '@/hooks/useDir';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { wp, hp, ms, fontSize as fs, radius } from '@/utils/responsive';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const VIOLET_GRADIENT = [palette.violet, palette.violetDark] as const;

// Module-level guard: prevents duplicate sends across remounts (ref resets on
// unmount, but the module variable persists). Keyed by email so switching
// accounts still works.
let _lastSentEmail: string | null = null;
let _lastSentAt = 0;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const { merchant, updateMerchant } = useAuth();
  const { email, fromRegister } = useLocalSearchParams<{ email: string; fromRegister?: string }>();
  const isLoggedIn = !!merchant;

  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<TextInput>(null);
  const verifyingRef = useRef(false);
  const hasSentInitial = useRef(false);

  // Animations
  const [iconAnim] = useState(() => new Animated.Value(0));
  const [cardAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const anim = Animated.stagger(200, [
      Animated.spring(iconAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [iconAnim, cardAnim]);

  // If already verified (e.g. came back after verifying), skip this screen
  useEffect(() => {
    if (isLoggedIn && merchant?.emailVerified) {
      router.replace('/(tabs)');
    }
  }, [isLoggedIn, merchant?.emailVerified, router]);

  // Auto-send OTP on mount — skips if the backend already sent one during
  // registration (fromRegister param) or if this component remounts.
  useEffect(() => {
    if (!email || hasSentInitial.current) return;
    // Don't send if already verified
    if (isLoggedIn && merchant?.emailVerified) return;
    const normalizedEmail = email.trim().toLowerCase();
    // If we just came from registration, the backend already sent the OTP
    if (fromRegister === '1') {
      hasSentInitial.current = true;
      _lastSentEmail = normalizedEmail;
      _lastSentAt = Date.now();
      setResendTimer(RESEND_COOLDOWN);
      return;
    }
    // Module-level dedup: skip if we already sent for this email recently
    if (_lastSentEmail === normalizedEmail && Date.now() - _lastSentAt < RESEND_COOLDOWN * 1000) {
      hasSentInitial.current = true;
      setResendTimer(Math.max(0, RESEND_COOLDOWN - Math.floor((Date.now() - _lastSentAt) / 1000)));
      return;
    }
    hasSentInitial.current = true;
    _lastSentEmail = normalizedEmail;
    _lastSentAt = Date.now();
    (async () => {
      try {
        await api.post('/auth/send-verification-email', {
          email: normalizedEmail,
        });
        setResendTimer(RESEND_COOLDOWN);
      } catch {
        // Silently fail — user can tap resend
      }
    })();
  }, [email, isLoggedIn, merchant?.emailVerified, fromRegister]);

  // Countdown timer — stops when it reaches 0
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const handleVerify = useCallback(async () => {
    if (code.length !== OTP_LENGTH || !email || verifyingRef.current) return;

    verifyingRef.current = true;
    setIsVerifying(true);
    setError('');
    try {
      await api.post('/auth/verify-email', {
        email: email.trim().toLowerCase(),
        code,
      });
      if (isLoggedIn) {
        updateMerchant({ emailVerified: true });
        router.replace('/(tabs)');
      } else {
        Alert.alert(
          t('verifyEmail.successTitle'),
          t('verifyEmail.successMsg'),
          [{ text: 'OK', onPress: () => router.replace('/login') }],
        );
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('verifyEmail.errorGeneric')));
      setCode('');
      inputRef.current?.focus();
    } finally {
      verifyingRef.current = false;
      setIsVerifying(false);
    }
  }, [code, email, t, router, isLoggedIn, updateMerchant]);

  // Auto-verify when 6 digits entered
  useEffect(() => {
    if (code.length === OTP_LENGTH) {
      handleVerify();
    }
  }, [code, handleVerify]);

  const handleResend = useCallback(async () => {
    if (resendTimer > 0 || !email || isResending) return;

    setIsResending(true);
    setError('');
    try {
      await api.post('/auth/send-verification-email', {
        email: email.trim().toLowerCase(),
      });
      setResendTimer(RESEND_COOLDOWN);
      Alert.alert(t('verifyEmail.resentTitle'), t('verifyEmail.resentMsg'));
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('verifyEmail.resendError')));
    } finally {
      setIsResending(false);
    }
  }, [resendTimer, email, isResending, t]);

  const maskedEmail = useMemo(() => email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_m, a, b, c) => a + '*'.repeat(Math.min(b.length, 5)) + c)
    : '', [email]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableOpacity
          style={[styles.backBtn, { alignSelf: dir.alignStart }]}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/login')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>

        <View style={styles.content}>
          <Animated.View
            style={[
              styles.iconWrap,
              {
                opacity: iconAnim,
                transform: [{ scale: iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
              },
            ]}
          >
            <LinearGradient
              colors={VIOLET_GRADIENT}
              style={styles.iconCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Mail color="#fff" size={36} strokeWidth={icon.stroke} />
            </LinearGradient>
          </Animated.View>

          <Text style={[styles.title, { color: theme.text }]}>
            {t('verifyEmail.title')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('verifyEmail.subtitle', { email: maskedEmail })}
          </Text>

          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: theme.bgCard,
                borderColor: theme.borderLight,
                opacity: cardAnim,
                transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[
                styles.codeInput,
                {
                  color: theme.text,
                  borderColor: error ? theme.danger : theme.inputBorder,
                  backgroundColor: theme.bgInput,
                },
              ]}
              value={code}
              onChangeText={(text) => {
                const cleaned = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
                setCode(cleaned);
                if (error) setError('');
              }}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              placeholder="000000"
              placeholderTextColor={theme.textMuted}
              textAlign="center"
              autoFocus
            />

            <View style={styles.dotsRow}>
              {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: code[i] ? palette.violet : theme.borderLight,
                    },
                  ]}
                />
              ))}
            </View>

            {error ? (
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            ) : null}

            <ActionButton
              label={t('verifyEmail.verifyBtn')}
              icon={ShieldCheck}
              onPress={handleVerify}
              disabled={code.length !== OTP_LENGTH}
              loading={isVerifying}
              size="lg"
              gradient={VIOLET_GRADIENT}
              gradientDirection="horizontal"
              style={styles.verifyBtn}
            />
          </Animated.View>

          <View style={styles.resendRow}>
            <Text style={[styles.resendLabel, { color: theme.textSecondary }]}>
              {t('verifyEmail.noCode')}
            </Text>
            {resendTimer > 0 ? (
              <Text style={[styles.resendTimer, { color: theme.textMuted }]}>
                {t('verifyEmail.resendIn', { seconds: resendTimer })}
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={isResending} accessibilityRole="button">
                {isResending ? (
                  <ActivityIndicator color={palette.violet} size="small" />
                ) : (
                  <View style={[styles.resendBtnRow, { flexDirection: dir.row }]}>
                    <RefreshCw color={palette.violet} size={16} strokeWidth={icon.stroke} />
                    <Text style={[styles.resendBtnText, { color: palette.violet }]}>
                      {t('verifyEmail.resendBtn')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  backBtn: {
    marginTop: hp(8),
    marginHorizontal: wp(16),
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(24),
    paddingBottom: hp(40),
  },
  iconWrap: { marginBottom: hp(24) },
  iconCircle: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: ms(24),
    fontFamily: font.bold,
    textAlign: 'center',
    marginBottom: hp(8),
  },
  subtitle: {
    fontSize: fs.sm,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: ms(22),
    marginBottom: hp(32),
    paddingHorizontal: wp(16),
  },
  card: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: wp(24),
    alignItems: 'center',
  },
  codeInput: {
    width: '100%',
    height: hp(56),
    borderRadius: radius.md,
    borderWidth: 1.5,
    fontSize: ms(28),
    fontFamily: font.bold,
    letterSpacing: 12,
    paddingHorizontal: wp(16),
  },
  dotsRow: {
    flexDirection: 'row',
    gap: wp(8),
    marginTop: hp(12),
    marginBottom: hp(8),
  },
  dot: {
    width: ms(8),
    height: ms(8),
    borderRadius: ms(4),
  },
  errorText: {
    fontSize: fs.xs,
    fontFamily: font.medium,
    textAlign: 'center',
    marginTop: hp(8),
    marginBottom: hp(4),
  },
  verifyBtn: {
    alignSelf: 'stretch',
    marginTop: hp(20),
    borderWidth: 0,
  },
  resendRow: {
    marginTop: hp(24),
    alignItems: 'center',
    gap: hp(8),
  },
  resendLabel: {
    fontSize: fs.sm,
    fontFamily: font.regular,
  },
  resendTimer: {
    fontSize: fs.sm,
    fontFamily: font.semibold,
  },
  resendBtnRow: {
    alignItems: 'center',
    gap: wp(6),
  },
  resendBtnText: {
    fontSize: fs.sm,
    fontFamily: font.bold,
  },
});
