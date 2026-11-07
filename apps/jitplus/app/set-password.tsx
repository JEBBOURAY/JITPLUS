import { useState, useRef, useEffect, useCallback, useMemo, memo, type RefObject } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Animated, Image,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { goHomeAfterLogin } from '@/services/pendingDeal';
import { router, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lock, Eye, EyeOff, ArrowLeft, ArrowRight, CheckCircle2, type LucideIcon } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import BrandText from '@/components/BrandText';
import FormError from '@/components/FormError';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFocusAfterTransition } from '@/hooks/useFocusAfterTransition';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { getPasswordStrength, isValidPassword as checkPassword, MAX_PASSWORD_LENGTH } from '@/utils/passwordStrength';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

/**
 * Forgot-password step 2, reached from verify-otp. The OTP session opened
 * there is held in memory only and the client is not logged in yet; leaving
 * this screen without saving a new password discards that session.
 */
export default function SetPasswordScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const navigation = useNavigation();
  const { resetPasswordOtp, cancelPasswordReset } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  const completedRef = useRef(false);

  useFocusAfterTransition(passwordRef);

  // Back gesture, hardware back, the back button or a redirect: the reset
  // session must not outlive the screen unless the password was saved.
  useEffect(() => {
    const unsubscribe = navigation.addListener('removed', () => {
      if (!completedRef.current) void cancelPasswordReset();
    });
    // 'removed' fires after this cleanup, so unsubscribing must wait a tick.
    return () => queueMicrotask(unsubscribe);
  }, [navigation, cancelPasswordReset]);

  // Animations
  const [headerAnim] = useState(() => new Animated.Value(0));
  const [formAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const anim = Animated.stagger(200, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(formAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [headerAnim, formAnim]);

  const strength = useMemo(() => getPasswordStrength(password, t), [password, t]);
  const isValidPassword = checkPassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit = isValidPassword && passwordsMatch;

  const onPasswordChange = useCallback((text: string) => { setPassword(text); setError(''); }, []);
  const onConfirmChange = useCallback((text: string) => { setConfirmPassword(text); setError(''); }, []);
  const focusConfirm = useCallback(() => confirmRef.current?.focus(), []);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!isValidPassword) {
      setError(t('setPassword.validationError'));
      return;
    }
    if (!passwordsMatch) {
      setError(t('setPassword.mismatchError'));
      return;
    }

    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    const result = await resetPasswordOtp(password);

    if (result.success) {
      completedRef.current = true;
      await AsyncStorage.setItem('showWelcome', '1');
      goHomeAfterLogin(router);
      return;
    }

    submittingRef.current = false;
    setIsLoading(false);
    if (result.sessionExpired) {
      // The OTP proof is spent or too old: only a new code can unlock a reset.
      Alert.alert(t('setPassword.resetTitle'), result.error);
      router.replace('/login');
    } else if (result.isNetworkError) {
      Alert.alert(t('common.networkError'), result.error);
    } else {
      setError(result.error || t('common.genericError'));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.container}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={ms(22)} color={theme.text} />
        </TouchableOpacity>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo */}
            <Animated.View style={[styles.header, {
              opacity: headerAnim,
              transform: [{
                scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
              }],
            }]}>
              <Image
                source={require('@/assets/images/jitpluslogo-app.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <BrandText size={24} />
            </Animated.View>

            {/* Form */}
            <Animated.View style={[styles.formSection, {
              opacity: formAnim,
              transform: [{ translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
            }]}>
              <View style={styles.titleBlock}>
                <Text style={[styles.title, { color: theme.text }]}>{t('setPassword.resetTitle')}</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t('setPassword.resetSubtitle')}</Text>
              </View>

              <PasswordField
                inputRef={passwordRef}
                icon={Lock}
                value={password}
                onChangeText={onPasswordChange}
                placeholder={t('setPassword.placeholder')}
                valid={isValidPassword}
                invalid={!!error && !isValidPassword}
                returnKeyType="next"
                onSubmitEditing={focusConfirm}
              />

              {password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarTrack}>
                    <View style={[styles.strengthBarFill, { width: `${strength.pct * 100}%`, backgroundColor: strength.color }]} />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                </View>
              )}

              <PasswordField
                inputRef={confirmRef}
                icon={CheckCircle2}
                value={confirmPassword}
                onChangeText={onConfirmChange}
                placeholder={t('setPassword.confirmPlaceholder')}
                valid={passwordsMatch}
                invalid={(!!error || showMismatch) && !passwordsMatch}
                returnKeyType="done"
                onSubmitEditing={canSubmit ? handleSubmit : undefined}
              />

              {showMismatch && (
                <Text style={[styles.mismatchText, { color: theme.danger }]}>
                  {t('setPassword.mismatchError')}
                </Text>
              )}

              <FormError message={error} />

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
                style={[styles.button, { backgroundColor: canSubmit ? palette.violet : '#D4D0E8' }]}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={[styles.buttonText, { opacity: canSubmit ? 1 : 0.5 }]}>{t('setPassword.submit')}</Text>
                    <ArrowRight size={ms(18)} color={canSubmit ? '#fff' : 'rgba(255,255,255,0.5)'} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

interface PasswordFieldProps {
  inputRef: RefObject<TextInput | null>;
  icon: LucideIcon;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Requirement met: violet border and icon. */
  valid: boolean;
  /** Error border; takes precedence over `valid`. */
  invalid: boolean;
  returnKeyType: 'next' | 'done';
  onSubmitEditing?: () => void;
}

/** Password input with its own show/hide toggle, so toggling re-renders the field only. */
const PasswordField = memo(function PasswordField({
  inputRef, icon: Icon, value, onChangeText, placeholder, valid, invalid, returnKeyType, onSubmitEditing,
}: PasswordFieldProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const toggleVisible = useCallback(() => setVisible((v) => !v), []);
  const EyeIcon = visible ? EyeOff : Eye;

  return (
    <View style={styles.inputContainer}>
      <View style={[styles.inputWrapper, {
        backgroundColor: theme.inputBg,
        borderColor: invalid ? theme.danger : valid ? palette.violet : theme.inputBorder,
        borderWidth: valid ? 2 : 1.5,
      }]}>
        <Icon size={ms(18)} color={valid ? palette.violet : theme.inputPlaceholder} strokeWidth={2} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.inputPlaceholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          returnKeyType={returnKeyType}
          maxLength={MAX_PASSWORD_LENGTH}
          onSubmitEditing={onSubmitEditing}
        />
        <TouchableOpacity
          onPress={toggleVisible}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={visible ? t('login.hidePassword') : t('login.showPassword')}
        >
          <EyeIcon size={ms(20)} color={theme.inputPlaceholder} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: {
    width: ms(44), height: ms(44), borderRadius: ms(22),
    justifyContent: 'center', alignItems: 'center',
    marginLeft: wp(16), marginTop: hp(8),
    borderWidth: 1,
  },
  scrollContent: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: wp(24), paddingVertical: hp(20),
  },

  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: hp(24) },
  logoImage: { width: ms(48), height: ms(48), marginRight: ms(8) },

  formSection: { paddingHorizontal: wp(4) },
  titleBlock: { marginBottom: hp(24) },
  title: {
    fontSize: ms(26), fontWeight: '700', letterSpacing: -0.3,
    marginBottom: hp(8),
  },
  subtitle: {
    fontSize: fontSize.sm, lineHeight: ms(22),
    marginBottom: hp(8),
  },

  inputContainer: { marginBottom: hp(16) },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, paddingHorizontal: wp(14), height: hp(58),
  },
  input: {
    flex: 1, fontSize: fontSize.md, fontWeight: '500', marginLeft: wp(10),
  },

  strengthContainer: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    marginTop: -hp(8), marginBottom: hp(16), paddingHorizontal: wp(4),
  },
  strengthBarTrack: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', overflow: 'hidden',
  },
  strengthBarFill: { height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: fontSize.xs, fontWeight: '700', width: wp(48) },

  mismatchText: { fontSize: fontSize.xs, marginTop: hp(4), marginBottom: hp(4), marginLeft: wp(4) },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.lg, height: hp(56), gap: wp(8),
    paddingHorizontal: wp(20),
  },
  buttonText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700', letterSpacing: 0.5 },
});
