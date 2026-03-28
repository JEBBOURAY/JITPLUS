import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Animated, Image,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import BrandText from '@/components/BrandText';
import FormError from '@/components/FormError';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { getPasswordStrength, isValidPassword as checkPassword } from '@/utils/passwordStrength';

export default function SetPasswordScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { setPassword } = useAuth();
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const confirmRef = useRef<TextInput>(null);

  const strength = getPasswordStrength(password, t);
  const clearError = useCallback(() => { if (error) setError(''); }, [error]);

  // Animations
  const headerAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.stagger(200, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(formAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    anim.start();
    return () => anim.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isValidPassword = checkPassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = isValidPassword && passwordsMatch;

  const handleSubmit = async () => {
    if (!isValidPassword) {
      setError(t('setPassword.validationError'));
      return;
    }
    if (!passwordsMatch) {
      setError(t('setPassword.mismatchError'));
      return;
    }

    setIsLoading(true);
    setError('');
    const result = await setPassword(password);
    setIsLoading(false);

    if (result.success) {
      await AsyncStorage.setItem('showWelcome', '1');
      router.replace('/(tabs)/qr');
    } else {
      if (result.error && result.error === t('common.networkError')) {
        Alert.alert(t('common.networkError'), result.error);
      } else {
        setError(result.error || t('common.genericError'));
      }
    }
  };

  return (
    <View style={[styles.gradient, { backgroundColor: '#fff' }]}>
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
            {/* Logo */}
            <Animated.View style={[styles.header, {
              opacity: headerAnim,
              transform: [{
                scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
              }],
            }]}>
              <Image
                source={require('@/assets/images/jitpluslogo.png')}
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
              <View style={{ marginBottom: hp(24) }}>
                <Text style={[styles.title, { color: theme.text }]}>{t('setPassword.title')}</Text>
                <Text style={[styles.subtitle, { color: theme.inputPlaceholder }]}>
                  {t('setPassword.subtitle')}
                </Text>
              </View>

              {/* Password */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: error && !isValidPassword ? theme.danger : isValidPassword ? palette.violet : theme.inputBorder,
                  borderWidth: isValidPassword ? 2 : 1.5,
                }]}>
                  <Lock size={ms(18)} color={isValidPassword ? palette.violet : theme.inputPlaceholder} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder={t('setPassword.placeholder')}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={password}
                    onChangeText={(text) => { setPasswordValue(text); clearError(); }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}>
                    {showPassword ? (
                      <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                    ) : (
                      <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Password Strength */}
              {password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarTrack}>
                    <View style={[styles.strengthBarFill, { width: `${strength.pct * 100}%`, backgroundColor: strength.color }]} />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                </View>
              )}

              {/* Confirm */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: error && !passwordsMatch ? theme.danger : passwordsMatch ? palette.violet : theme.inputBorder,
                  borderWidth: passwordsMatch ? 2 : 1.5,
                }]}>
                  <CheckCircle2 size={ms(18)} color={passwordsMatch ? palette.violet : theme.inputPlaceholder} strokeWidth={1.5} />
                  <TextInput
                    ref={confirmRef}
                    style={[styles.input, { color: theme.text }]}
                    placeholder={t('setPassword.confirmPlaceholder')}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={confirmPassword}
                    onChangeText={(text) => { setConfirmPassword(text); clearError(); }}
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={canSubmit ? handleSubmit : undefined}
                  />
                  <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={showConfirm ? t('login.hidePassword') : t('login.showPassword')}>
                    {showConfirm ? (
                      <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                    ) : (
                      <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

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

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: wp(24), paddingVertical: hp(20),
  },

  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: hp(24) },
  logoImage: { width: ms(48), height: ms(48), marginRight: ms(8) },

  formSection: { paddingHorizontal: wp(4) },
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

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.lg, height: hp(56), gap: wp(8),
    paddingHorizontal: wp(20),
  },
  buttonText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700', letterSpacing: 0.5 },
});
