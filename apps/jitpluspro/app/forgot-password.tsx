import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
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
import { isValidPassword } from '@/utils/passwordStrength';
import { Mail, ArrowRight, ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import api from '@/services/api';

type Step = 'email' | 'otp' | 'password';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

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
  const dir = useDir();
  const inputRow = { flexDirection: dir.row };
  const inputText = [styles.inputField, dir.isRTL ? styles.inputFieldRtl : styles.inputFieldLtr, { color: theme.text, textAlign: dir.textAlign }];
  const errorBanner = !!error && (
    <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
      <Text style={[styles.errorText, { color: theme.danger, textAlign: dir.textAlign }]}>{error}</Text>
    </View>
  );

  const [fadeAnim] = useState(() => new Animated.Value(0));
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (step === 'otp') timers.push(setTimeout(() => otpInputRef.current?.focus(), 300));
    if (step === 'password') timers.push(setTimeout(() => passwordInputRef.current?.focus(), 300));
    return () => { for (const t of timers) clearTimeout(t); };
  }, [step]);

  const emailValid = isValidEmail(email);
  const codeComplete = code.length === OTP_LENGTH;
  const newPasswordLongEnough = newPassword.length >= MIN_PASSWORD_LENGTH;
  // Equal strings share a length, so this also implies confirmPassword meets the minimum.
  const passwordsMatch = newPasswordLongEnough && confirmPassword === newPassword;

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
      setCooldown(RESEND_COOLDOWN);
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
      setCooldown(RESEND_COOLDOWN);
      setCode('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('common.genericError')));
    } finally {
      setIsLoading(false);
    }
  }, [email, cooldown, t]);

  const handleVerifyAndReset = useCallback(() => {
    Keyboard.dismiss();
    setError('');

    if (!codeComplete) {
      setError(t('forgotPassword.invalidCode'));
      return;
    }

    setStep('password');
  }, [codeComplete, t]);

  const handleResetPassword = useCallback(async () => {
    Keyboard.dismiss();
    setError('');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t('login.passwordTooShort', { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (!isValidPassword(newPassword)) {
      setError(t('forgotPassword.passwordRequirements'));
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
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              onPress={handleBack}
              style={[styles.backButton, dir.isRTL ? styles.backButtonRtl : styles.backButtonLtr]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
            </TouchableOpacity>

            <Animated.View style={[styles.formSection, { opacity: fadeAnim }]}>
              <View style={styles.header}>
                <View style={[styles.iconCircle, { backgroundColor: `${palette.charbon}12` }]}>
                  <KeyRound size={ms(28)} color={palette.charbon} strokeWidth={icon.stroke} />
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

              {step === 'email' && (
                <>
                  <View style={styles.inputContainer}>
                    <View style={[styles.inputWrapper, inputRow, {
                      backgroundColor: theme.inputBg,
                      borderColor: error ? theme.danger : emailValid ? palette.charbon : theme.inputBorder,
                      borderWidth: emailValid ? 2 : 1.5,
                    }]}>
                      <Mail size={ms(18)} color={emailValid ? palette.charbon : theme.inputPlaceholder} strokeWidth={icon.stroke} />
                      <TextInput
                        style={inputText}
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

                  {errorBanner}

                  <ActionButton
                    label={t('forgotPassword.sendCode')}
                    onPress={handleSendCode}
                    loading={isLoading}
                    size="lg"
                    icon={ArrowRight}
                    iconPosition="end"
                    flipIconInRTL
                    style={emailValid ? styles.buttonActive : styles.buttonInactive}
                    labelStyle={emailValid ? undefined : styles.buttonTextMuted}
                  />
                </>
              )}

              {step === 'otp' && (
                <>
                  <View style={styles.inputContainer}>
                    <View style={[styles.inputWrapper, inputRow, {
                      backgroundColor: theme.inputBg,
                      borderColor: error ? theme.danger : codeComplete ? palette.charbon : theme.inputBorder,
                      borderWidth: codeComplete ? 2 : 1.5,
                    }]}>
                      <KeyRound size={ms(18)} color={codeComplete ? palette.charbon : theme.inputPlaceholder} strokeWidth={icon.stroke} />
                      <TextInput
                        ref={otpInputRef}
                        style={[inputText, styles.otpField]}
                        placeholder="000000"
                        placeholderTextColor={theme.inputPlaceholder}
                        value={code}
                        onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, OTP_LENGTH)); setError(''); }}
                        keyboardType="number-pad"
                        maxLength={OTP_LENGTH}
                        returnKeyType="done"
                        onSubmitEditing={handleVerifyAndReset}
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {errorBanner}

                  <ActionButton
                    label={t('forgotPassword.verify')}
                    onPress={handleVerifyAndReset}
                    loading={isLoading}
                    disabled={!codeComplete}
                    size="lg"
                    icon={ArrowRight}
                    iconPosition="end"
                    flipIconInRTL
                    style={codeComplete ? styles.buttonActive : styles.buttonInactive}
                    labelStyle={codeComplete ? undefined : styles.buttonTextMuted}
                  />

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

              {step === 'password' && (
                <>
                  <View style={styles.inputContainer}>
                    <View style={[styles.inputWrapper, inputRow, {
                      backgroundColor: theme.inputBg,
                      borderColor: error ? theme.danger : newPasswordLongEnough ? palette.charbon : theme.inputBorder,
                      borderWidth: newPasswordLongEnough ? 2 : 1.5,
                    }]}>
                      <JitLock size={ms(18)} color={newPasswordLongEnough ? palette.charbon : theme.inputPlaceholder} strokeWidth={icon.stroke} />
                      <TextInput
                        ref={passwordInputRef}
                        style={inputText}
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
                        accessibilityRole="button"
                      >
                        {showPassword
                          ? <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={icon.stroke} />
                          : <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={icon.stroke} />}
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <View style={[styles.inputWrapper, inputRow, {
                      backgroundColor: theme.inputBg,
                      borderColor: error ? theme.danger : passwordsMatch ? palette.charbon : theme.inputBorder,
                      borderWidth: passwordsMatch ? 2 : 1.5,
                    }]}>
                      <JitLock size={ms(18)} color={passwordsMatch ? palette.charbon : theme.inputPlaceholder} strokeWidth={icon.stroke} />
                      <TextInput
                        style={inputText}
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

                  {errorBanner}

                  <ActionButton
                    label={t('forgotPassword.resetBtn')}
                    onPress={handleResetPassword}
                    loading={isLoading}
                    size="lg"
                    icon={ArrowRight}
                    iconPosition="end"
                    flipIconInRTL
                    style={passwordsMatch ? styles.buttonActive : styles.buttonInactive}
                    labelStyle={passwordsMatch ? undefined : styles.buttonTextMuted}
                  />
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
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(24),
    paddingVertical: hp(20),
  },
  backButton: {
    position: 'absolute',
    top: hp(12),
    padding: ms(8),
    zIndex: 10,
  },
  backButtonLtr: { left: 0 },
  backButtonRtl: { right: 0 },
  formSection: { paddingHorizontal: wp(4) },

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
    fontFamily: font.bold,
    textAlign: 'center',
    marginBottom: hp(8),
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: font.medium,
    textAlign: 'center',
    lineHeight: ms(20),
  },
  inputContainer: { marginBottom: hp(16) },
  inputWrapper: {
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: wp(14),
    height: hp(56),
  },
  inputField: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font.medium,
  },
  inputFieldLtr: { marginLeft: wp(10) },
  inputFieldRtl: { marginRight: wp(10) },
  otpField: { letterSpacing: 8, textAlign: 'center' },
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: hp(12),
  },
  errorText: { fontSize: 13, fontFamily: font.regular },
  buttonActive: { backgroundColor: palette.charbon, borderColor: palette.charbon },
  buttonInactive: { backgroundColor: '#D4D0E8', borderColor: '#D4D0E8' },
  buttonTextMuted: { opacity: 0.5 },
  resendRow: {
    alignItems: 'center',
    marginTop: hp(16),
    padding: ms(8),
  },
  resendText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
});
