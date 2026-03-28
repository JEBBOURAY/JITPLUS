import { useState, useRef, useEffect } from 'react';
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
  Image,
  ScrollView,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { router } from 'expo-router';
import { ArrowRight, Mail, ChevronLeft, Check, Phone } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { isValidEmail } from '@/utils/validation';
import BrandText from '@/components/BrandText';
import { DEFAULT_COUNTRY, isValidPhoneForCountry, CountryCode } from '@/utils/countryCodes';
import CountryCodePicker from '@/components/CountryCodePicker';
import FormError from '@/components/FormError';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';

export default function RegisterScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { sendOtpEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Google auth — shared hook (no stale closures, no eslint-disable)
  const google = useGoogleAuth({ actionLabel: t('register.signUpButton') });

  // Sync google hook errors/loading into local state
  useEffect(() => { if (google.error) setError(google.error); }, [google.error]);
  // Bidirectional sync: also reset to false so the form unlocks after Google cancel/error
  useEffect(() => { setIsLoading(google.isLoading); }, [google.isLoading]);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.stagger(150, [
      Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    anim.start();
    return () => anim.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailValid = isValidEmail(email);
  const phoneValid = isValidPhoneForCountry(phone, country);
  const inputValid = emailValid && phoneValid;

  const handleRegister = async () => {
    if (!termsAccepted) {
      setError(t('register.termsRequired'));
      return;
    }
    if (!emailValid) {
      setError(t('login.invalidEmail'));
      return;
    }
    if (!phoneValid) {
      setError(t('register.phoneRequired'));
      return;
    }
    setIsLoading(true);
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    const fullPhone = `${country.dial}${phone}`;

    const result = await sendOtpEmail(normalizedEmail, true, fullPhone);
    setIsLoading(false);
    if (result.success) {
      router.push({
        pathname: '/verify-otp',
        params: { telephone: normalizedEmail, isEmail: '1', isRegister: '1' },
      });
    } else {
      if (result.error && result.error === t('common.networkError')) {
        Alert.alert(t('common.networkError'), result.error);
      } else {
        setError(result.error || t('common.genericError'));
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: '#fff' }]}>
      <SafeAreaView style={styles.safe}>
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
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <ChevronLeft size={ms(24)} color={theme.text} strokeWidth={1.5} />
            </TouchableOpacity>

            {/* Logo */}
            <Animated.View style={[styles.header, {
              opacity: fadeAnim,
              transform: [{
                scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
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
              opacity: slideAnim,
              transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
            }]}>
              <Text style={[styles.title, { color: theme.text }]}>{t('register.title')}</Text>
              <Text style={[styles.subtitle, { color: theme.inputPlaceholder }]}>
                {t('register.subtitle')}
              </Text>

              {/* Google Sign-In */}
              <TouchableOpacity
                style={[styles.googleBtn, { backgroundColor: theme.bgCard, borderColor: theme.inputBorder }]}
                onPress={() => {
                  if (!termsAccepted) { setError(t('register.termsRequired')); return; }
                  google.promptGoogle();
                }}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('register.signUpWithGoogle')}
              >
                <View style={styles.googleIconWrap}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={[styles.googleBtnText, { color: theme.text }]}>{t('register.signUpWithGoogle')}</Text>
              </TouchableOpacity>

              {/* Separator */}
              <View style={styles.separator}>
                <View style={[styles.separatorLine, { backgroundColor: theme.inputBorder }]} />
                <Text style={[styles.separatorText, { color: theme.inputPlaceholder }]}>{t('common.or')}</Text>
                <View style={[styles.separatorLine, { backgroundColor: theme.inputBorder }]} />
              </View>

              {/* Email input */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: error ? theme.danger : emailValid ? palette.violet : theme.inputBorder,
                  borderWidth: emailValid ? 2 : 1.5,
                }]}>
                  <Mail size={ms(18)} color={emailValid ? palette.violet : theme.inputPlaceholder} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.emailInput, { color: theme.text }]}
                    placeholder={t('login.emailPlaceholder')}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={email}
                    onChangeText={(text) => { setEmail(text); setError(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Phone input (required) */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: error ? theme.danger : phoneValid ? palette.violet : theme.inputBorder,
                  borderWidth: phoneValid ? 2 : 1.5,
                }]}>
                  <CountryCodePicker selected={country} onSelect={setCountry} accentColor={palette.violet} />
                  <View style={styles.phoneSeparator} />
                  <TextInput
                    style={[styles.emailInput, { color: theme.text, marginLeft: 0 }]}
                    placeholder={'X'.repeat(country.maxDigits)}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={phone}
                    onChangeText={(text) => { setPhone(text.replace(/[^0-9]/g, '')); setError(''); }}
                    keyboardType="phone-pad"
                    maxLength={country.maxDigits}
                  />
                </View>
              </View>

              {/* Terms acceptance */}
              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => { setTermsAccepted(!termsAccepted); setError(''); }}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
              >
                <View style={[styles.checkbox, {
                  backgroundColor: termsAccepted ? theme.primary : 'transparent',
                  borderColor: termsAccepted ? theme.primary : theme.inputBorder,
                }]}>
                  {termsAccepted && <Check size={ms(14)} color="#fff" strokeWidth={3} />}
                </View>
                <Text style={[styles.termsText, { color: theme.textSecondary }]}>
                  {t('register.acceptTerms')}
                  <Text
                    style={{ color: theme.primary, textDecorationLine: 'underline' }}
                    onPress={() => router.push('/legal')}
                  >
                    {t('register.termsLink')}
                  </Text>
                </Text>
              </TouchableOpacity>

              {/* Error */}
              <FormError message={error} />

              {/* Register button */}
              <TouchableOpacity
                onPress={handleRegister}
                disabled={isLoading}
                activeOpacity={0.85}
                style={[styles.button, {
                  backgroundColor: inputValid ? palette.violet : '#D4D0E8',
                }]}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={[styles.buttonText, { opacity: inputValid ? 1 : 0.5 }]}>
                      {t('register.signUpButton')}
                    </Text>
                    <ArrowRight size={ms(18)} color={inputValid ? '#fff' : 'rgba(255,255,255,0.5)'} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer – anchored at the bottom */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>{t('register.alreadyHaveAccount')}{' '}</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.footerLink}>{t('register.loginLink')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    flexGrow: 1, justifyContent: 'center', paddingHorizontal: wp(24), paddingVertical: hp(12),
  },

  backBtn: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: hp(8),
  },

  // Logo
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: hp(32) },
  logoImage: { width: ms(48), height: ms(48), marginRight: ms(8) },

  // Form
  formSection: { paddingHorizontal: wp(4) },
  title: {
    fontSize: ms(26), fontWeight: '700', letterSpacing: -0.3,
    marginBottom: hp(8),
  },
  subtitle: {
    fontSize: fontSize.sm, lineHeight: ms(22),
    marginBottom: hp(24),
  },

  // Input
  inputContainer: { marginBottom: hp(16) },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, paddingHorizontal: wp(14), height: hp(58),
  },
  emailInput: {
    flex: 1, fontSize: fontSize.md, fontWeight: '500', marginLeft: wp(10),
  },
  phonePrefix: {
    fontSize: fontSize.md, fontWeight: '600', marginLeft: wp(8),
  },
  phoneSeparator: {
    width: 1, height: ms(24), backgroundColor: '#ddd', marginHorizontal: wp(8),
  },

  // Tab switcher
  tabContainer: {
    flexDirection: 'row', borderRadius: radius.lg, borderWidth: 1.5,
    overflow: 'hidden', marginBottom: hp(16), height: hp(44),
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  tabText: {
    fontSize: fontSize.sm, fontWeight: '600',
  },



  // Google button
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: hp(54), borderRadius: radius.lg, gap: wp(10),
    marginBottom: hp(12), borderWidth: 1.5,
  },
  googleIconWrap: {
    width: ms(24), height: ms(24), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontSize: ms(18), fontWeight: '700', color: '#EA4335' },
  googleBtnText: { fontSize: fontSize.md, fontWeight: '600', letterSpacing: 0.2 },

  // Separator
  separator: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: hp(8), gap: wp(12), marginBottom: hp(16),
  },
  separatorLine: { flex: 1, height: 1 },
  separatorText: { fontSize: fontSize.sm, fontWeight: '500' },

  // Terms checkbox
  termsRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: hp(16), gap: wp(10),
  },
  checkbox: {
    width: ms(22), height: ms(22), borderRadius: ms(6),
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginTop: ms(1),
  },
  termsText: {
    flex: 1, fontSize: fontSize.sm, lineHeight: ms(20),
  },

  // Button
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.lg, height: hp(56), gap: wp(8),
    paddingHorizontal: wp(20),
  },
  buttonText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700', letterSpacing: 0.5 },

  // Footer
  footerContainer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingTop: hp(12), paddingBottom: hp(32),
  },
  footerText: { fontSize: fontSize.sm, color: palette.gray400 },
  footerLink: { fontSize: fontSize.sm, color: palette.violet, fontWeight: '700' },
});
