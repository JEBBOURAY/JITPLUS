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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Mail, ShieldCheck, RefreshCw } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const { merchant, updateMerchant } = useAuth();
  const { email } = useLocalSearchParams<{ email: string }>();
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
  const iconAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.stagger(200, [
      Animated.spring(iconAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  // Auto-send OTP on mount
  useEffect(() => {
    if (!email || hasSentInitial.current) return;
    hasSentInitial.current = true;
    (async () => {
      try {
        await api.post('/auth/send-verification-email', {
          email: email.trim().toLowerCase(),
        });
        setResendTimer(RESEND_COOLDOWN);
      } catch {
        // Silently fail — user can tap resend
      }
    })();
  }, [email]);

  // Countdown timer — stops when it reaches 0
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
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
        router.replace('/scan-qr');
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

  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_m, a, b, c) => a + '*'.repeat(Math.min(b.length, 5)) + c)
    : '';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/login')}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.content}>
          {/* Icon */}
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
              colors={[palette.violet, palette.violetDark ?? '#4c1d95']}
              style={styles.iconCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Mail color="#fff" size={40} strokeWidth={1.5} />
            </LinearGradient>
          </Animated.View>

          {/* Heading */}
          <Text style={[styles.title, { color: theme.text }]}>
            {t('verifyEmail.title')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('verifyEmail.subtitle', { email: maskedEmail })}
          </Text>

          {/* Code input card */}
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: theme.bgCard ?? theme.bg,
                borderColor: theme.borderLight ?? theme.border,
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
                  borderColor: error ? '#ef4444' : (theme.inputBorder ?? theme.border),
                  backgroundColor: theme.bgInput ?? theme.bg,
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
              placeholderTextColor={theme.textMuted ?? '#9ca3af'}
              textAlign="center"
              autoFocus
            />

            {/* Display the code digits */}
            <View style={styles.dotsRow}>
              {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: code[i]
                        ? palette.violet
                        : (theme.borderLight ?? theme.border),
                    },
                  ]}
                />
              ))}
            </View>

            {/* Error */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {/* Verify button */}
            <TouchableOpacity
              style={[
                styles.verifyBtn,
                { opacity: code.length === OTP_LENGTH && !isVerifying ? 1 : 0.5 },
              ]}
              onPress={handleVerify}
              disabled={code.length !== OTP_LENGTH || isVerifying}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[palette.violet, palette.violetDark ?? '#4c1d95']}
                style={styles.verifyBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <ShieldCheck color="#fff" size={20} strokeWidth={1.5} />
                    <Text style={styles.verifyBtnText}>{t('verifyEmail.verifyBtn')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={[styles.resendLabel, { color: theme.textSecondary }]}>
              {t('verifyEmail.noCode')}
            </Text>
            {resendTimer > 0 ? (
              <Text style={[styles.resendTimer, { color: theme.textMuted ?? '#9ca3af' }]}>
                {t('verifyEmail.resendIn', { seconds: resendTimer })}
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={isResending}>
                {isResending ? (
                  <ActivityIndicator color={palette.violet} size="small" />
                ) : (
                  <View style={styles.resendBtnRow}>
                    <RefreshCw color={palette.violet} size={16} strokeWidth={1.5} />
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
    marginTop: 8,
    marginLeft: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  iconWrap: { marginBottom: 24 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  codeInput: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 12,
    paddingHorizontal: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  verifyBtn: {
    width: '100%',
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  verifyBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  verifyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  resendRow: {
    marginTop: 24,
    alignItems: 'center',
    gap: 8,
  },
  resendLabel: {
    fontSize: 14,
  },
  resendTimer: {
    fontSize: 14,
    fontWeight: '600',
  },
  resendBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resendBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
