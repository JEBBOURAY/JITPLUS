import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
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
import { useRouter } from 'expo-router';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { getErrorMessage } from '@/utils/error';
import { isValidEmail } from '@/utils/validation';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { Mail, ArrowRight, ArrowLeft, Lock, KeyRound, Eye, EyeOff } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import api from '@/services/api';

type Step = 'email' | 'otp' | 'password';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const otpInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === 'otp') setTimeout(() => otpInputRef.current?.focus(), 300);
    if (step === 'password') setTimeout(() => passwordInputRef.current?.focus(), 300);
  }, [step]);

  const emailValid = isValidEmail(email);

  const handleSendCode = useCallback(async () => {
    Keyboard.dismiss();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError(t('forgotPassword.enterEmail'));
      return;
    }
    if (!emailValid) {
      setError(t('login.invalidEmail'));
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: trimmedEmail });
      setStep('otp');
      setCooldown(60);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('common.genericError')));
    } finally {
      setIsLoading(false);
    }
  }, [email, emailValid, t]);

  const handleResendCode = useCallback(async () => {
    if (cooldown > 0) return;
    setError('');
    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setCooldown(60);
      setCode('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('common.genericError')));
    } finally {
      setIsLoading(false);
    }
  }, [email, cooldown, t]);

  const handleVerifyAndReset = useCallback(async () => {
    Keyboard.dismiss();
    setError('');

    if (code.length !== 6) {
      setError(t('forgotPassword.invalidCode'));
      return;
    }

    setStep('password');
  }, [code, t]);

  const handleResetPassword = useCallback(async () => {
    Keyboard.dismiss();
    setError('');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t('login.passwordTooShort', { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('forgotPassword.passwordMismatch'));
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        code,
        newPassword,
      });
      Alert.alert(
        t('forgotPassword.successTitle'),
        t('forgotPassword.successMessage'),
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('common.genericError')));
    } finally {
      setIsLoading(false);
    }
  }, [email, code, newPassword, confirmPassword, router, t]);

  const handleBack = () => {
    if (step === 'password') { setStep('otp'); setError(''); }
    else if (step === 'otp') { setStep('email'); setError(''); setCode(''); }
    else router.back();
  };

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
            {/* Back button */}
            <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
              <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={1.5} />
            </TouchableOpacity>

            <Animated.View style={[styles.formSection, { opacity: fadeAnim }]}>
              {/* Header */}
              <View style={styles.header}>
                <View style={[styles.iconCircle, { backgroundColor: `${palette.charbon}12` }]}>
                  <KeyRound size={ms(28)} color={palette.charbon} strokeWidth={1.5} />
                </View>
                <Text style={[styles.title, { color: theme.text }]}>
                  {step === 'email' && t('forgotPassword.title')}
                  {step === 'otp' && t('forgotPassword.otpTitle')}
                  {step === 'password' && t('forgotPassword.newPasswordTitle')}
                </Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                  {step === 'email' && t('forgotPassword.subtitle')}
                  {step === 'otp' && t('forgotPassword.otpSubtitle', { email: email.trim().toLowerCase() })}
                  {step === 'password' && t('forgotPassword.newPasswordSubtitle')}
                </Text>
              </View>

              {/* ── Step 1: Email ── */}
              {step === 'email' && (
                <>
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
                        returnKeyType="done"
                        onSubmitEditing={handleSendCode}
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {!!error && (
                    <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                      <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleSendCode}
                    disabled={isLoading}
                    activeOpacity={0.85}
                    style={[styles.button, { backgroundColor: emailValid ? palette.charbon : '#D4D0E8' }]}
                  >
                    {isLoading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={[styles.buttonText, { opacity: emailValid ? 1 : 0.5 }]}>
                          {t('forgotPassword.sendCode')}
                        </Text>
                        <ArrowRight size={ms(18)} color={emailValid ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ── Step 2: OTP ── */}
              {step === 'otp' && (
                <>
                  <View style={styles.inputContainer}>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.inputBg,
                      borderColor: error ? theme.danger : code.length === 6 ? palette.charbon : theme.inputBorder,
                      borderWidth: code.length === 6 ? 2 : 1.5,
                    }]}>
                      <KeyRound size={ms(18)} color={code.length === 6 ? palette.charbon : theme.inputPlaceholder} strokeWidth={1.5} />
                      <TextInput
                        ref={otpInputRef}
                        style={[styles.inputField, { color: theme.text, letterSpacing: 8, textAlign: 'center' }]}
                        placeholder="000000"
                        placeholderTextColor={theme.inputPlaceholder}
                        value={code}
                        onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                        keyboardType="number-pad"
                        maxLength={6}
                        returnKeyType="done"
                        onSubmitEditing={handleVerifyAndReset}
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {!!error && (
                    <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                      <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleVerifyAndReset}
                    disabled={isLoading || code.length !== 6}
                    activeOpacity={0.85}
                    style={[styles.button, { backgroundColor: code.length === 6 ? palette.charbon : '#D4D0E8' }]}
                  >
                    {isLoading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={[styles.buttonText, { opacity: code.length === 6 ? 1 : 0.5 }]}>
                          {t('forgotPassword.verify')}
                        </Text>
                        <ArrowRight size={ms(18)} color={code.length === 6 ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} />
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Resend */}
                  <TouchableOpacity
                    onPress={handleResendCode}
                    disabled={cooldown > 0 || isLoading}
                    activeOpacity={0.7}
                    style={styles.resendRow}
                  >
                    <Text style={[styles.resendText, { color: cooldown > 0 ? theme.textMuted : palette.charbon }]}>
                      {cooldown > 0
                        ? t('forgotPassword.resendIn', { seconds: cooldown })
                        : t('forgotPassword.resend')}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ── Step 3: New Password ── */}
              {step === 'password' && (
                <>
                  <View style={styles.inputContainer}>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.inputBg,
                      borderColor: error ? theme.danger : newPassword.length >= MIN_PASSWORD_LENGTH ? palette.charbon : theme.inputBorder,
                      borderWidth: newPassword.length >= MIN_PASSWORD_LENGTH ? 2 : 1.5,
                    }]}>
                      <Lock size={ms(18)} color={newPassword.length >= MIN_PASSWORD_LENGTH ? palette.charbon : theme.inputPlaceholder} strokeWidth={1.5} />
                      <TextInput
                        ref={passwordInputRef}
                        style={[styles.inputField, { color: theme.text }]}
                        placeholder={t('forgotPassword.newPasswordPlaceholder')}
                        placeholderTextColor={theme.inputPlaceholder}
                        value={newPassword}
                        onChangeText={(v) => { setNewPassword(v); setError(''); }}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        returnKeyType="next"
                        editable={!isLoading}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword((p) => !p)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        {showPassword
                          ? <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                          : <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />}
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.inputBg,
                      borderColor: error ? theme.danger : confirmPassword.length >= MIN_PASSWORD_LENGTH && confirmPassword === newPassword ? palette.charbon : theme.inputBorder,
                      borderWidth: confirmPassword === newPassword && confirmPassword.length >= MIN_PASSWORD_LENGTH ? 2 : 1.5,
                    }]}>
                      <Lock size={ms(18)} color={confirmPassword === newPassword && confirmPassword.length >= MIN_PASSWORD_LENGTH ? palette.charbon : theme.inputPlaceholder} strokeWidth={1.5} />
                      <TextInput
                        style={[styles.inputField, { color: theme.text }]}
                        placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
                        placeholderTextColor={theme.inputPlaceholder}
                        value={confirmPassword}
                        onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        returnKeyType="done"
                        onSubmitEditing={handleResetPassword}
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {!!error && (
                    <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                      <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleResetPassword}
                    disabled={isLoading}
                    activeOpacity={0.85}
                    style={[styles.button, {
                      backgroundColor: newPassword.length >= MIN_PASSWORD_LENGTH && confirmPassword === newPassword
                        ? palette.charbon : '#D4D0E8',
                    }]}
                  >
                    {isLoading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={[styles.buttonText, {
                          opacity: newPassword.length >= MIN_PASSWORD_LENGTH && confirmPassword === newPassword ? 1 : 0.5,
                        }]}>
                          {t('forgotPassword.resetBtn')}
                        </Text>
                        <ArrowRight size={ms(18)} color={
                          newPassword.length >= MIN_PASSWORD_LENGTH && confirmPassword === newPassword
                            ? '#fff' : 'rgba(255,255,255,0.5)'
                        } strokeWidth={1.5} />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(24),
    paddingVertical: hp(20),
  },
  backButton: {
    position: 'absolute',
    top: hp(12),
    left: 0,
    padding: ms(8),
    zIndex: 10,
  },
  formSection: { paddingHorizontal: wp(4) },

  // Header
  header: { alignItems: 'center', marginBottom: hp(32) },
  iconCircle: {
    width: ms(64),
    height: ms(64),
    borderRadius: ms(32),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(16),
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: hp(8),
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: ms(20),
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

  // Resend
  resendRow: {
    alignItems: 'center',
    marginTop: hp(16),
    padding: ms(8),
  },
  resendText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
