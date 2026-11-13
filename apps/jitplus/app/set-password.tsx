import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Animated, Image, I18nManager,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { goHomeAfterLogin } from '@/services/pendingDeal';
import { router, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lock, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import BrandText from '@/components/BrandText';
import FormError from '@/components/FormError';
import { PasswordField, PasswordStrengthBar } from '@/components/PasswordField';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFocusAfterTransition } from '@/hooks/useFocusAfterTransition';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { getPasswordStrength, isValidPassword as checkPassword } from '@/utils/passwordStrength';
import { SPRING_SMOOTH, rnSpring } from '@/utils/motion';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

// Directional arrows point the reading way: Arabic reloads the app with forceRTL.
const DIR_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

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
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) }),
      Animated.spring(formAnim, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) }),
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
          <ArrowLeft size={ms(22)} color={theme.text} style={DIR_FLIP} />
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
                <PasswordStrengthBar strength={strength} />
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
                    <ArrowRight size={ms(18)} color={canSubmit ? '#fff' : 'rgba(255,255,255,0.5)'} style={DIR_FLIP} />
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
    fontSize: ms(26), fontWeight: '600', letterSpacing: -0.3,
    marginBottom: hp(8),
  },
  subtitle: {
    fontSize: fontSize.sm, lineHeight: ms(22),
    marginBottom: hp(8),
  },

  mismatchText: { fontSize: fontSize.xs, marginTop: hp(4), marginBottom: hp(4), marginLeft: wp(4) },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.lg, height: hp(56), gap: wp(8),
    paddingHorizontal: wp(20),
  },
  buttonText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '600' },
});
