import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView, Animated, Easing, Image,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User, ArrowRight, CheckCircle2, Sparkles, ChevronLeft, Calendar,
  Lock, Eye, EyeOff,
} from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { DEFAULT_COUNTRY, isValidPhoneForCountry, CountryCode } from '@/utils/countryCodes';
import CountryCodePicker from '@/components/CountryCodePicker';
import BrandText from '@/components/BrandText';
import FormError from '@/components/FormError';
import { formatDateInput, toIsoDate } from '@/utils/dateInput';

type Step = 'info' | 'password';
type PasswordStrength = 'weak' | 'medium' | 'strong';

function getPasswordStrength(pw: string, t: (key: string) => string): { level: PasswordStrength; label: string; color: string; pct: number } {
  if (pw.length === 0) return { level: 'weak', label: '', color: '#D1D5DB', pct: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: 'weak', label: t('setPassword.strengthWeak'), color: '#EF4444', pct: 0.33 };
  if (score <= 3) return { level: 'medium', label: t('setPassword.strengthMedium'), color: '#F59E0B', pct: 0.66 };
  return { level: 'strong', label: t('setPassword.strengthStrong'), color: '#10B981', pct: 1 };
}

/** Strip anything that isn't a letter, accent, space, hyphen or apostrophe */
const sanitizeName = (text: string) => text.replace(/[^a-zA-Z\u00C0-\u024F\s'-]/g, '');

export default function CompleteProfileScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { completeProfile, client } = useAuth();
  const { needsPassword } = useLocalSearchParams<{ needsPassword?: string }>();
  const showPhoneField = !client?.telephone;
  const STEPS: readonly Step[] = needsPassword === '1' ? ['info', 'password'] : ['info'];
  const [step, setStep] = useState<Step>('info');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [dateNaissance, setDateNaissance] = useState('');
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Animations
  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0.5)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const clearError = useCallback(() => { if (error) setError(''); }, [error]);

  const nomInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const strength = getPasswordStrength(password, t);

  useEffect(() => {
    const staggerAnim = Animated.stagger(200, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]);
    staggerAnim.start();

    // Subtle pulse on the icon
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loopAnim.start();

    return () => {
      staggerAnim.stop();
      loopAnim.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateToStep = (newStep: Step) => {
    const idx = STEPS.indexOf(newStep);
    Animated.timing(progressAnim, { toValue: (idx + 1) / STEPS.length, duration: 400, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    setStep(newStep);
  };

  const isPhoneValid = telephone.trim().length === 0 || isValidPhoneForCountry(telephone, country);
  const canGoNext = prenom.trim().length >= 2 && nom.trim().length >= 2;
  const isValidPassword = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmitPassword = isValidPassword && passwordsMatch;
  const canSubmit = needsPassword === '1' ? canGoNext && canSubmitPassword : canGoNext;

  const handleNext = () => {
    if (prenom.trim().length < 2 || nom.trim().length < 2) {
      setError(t('completeProfile.nameError'));
      return;
    }
    if (telephone.trim().length > 0 && !isPhoneValid) {
      setError(t('completeProfile.phoneError'));
      return;
    }
    setError('');
    animateToStep('password');
  };

  const handleBack = () => {
    setError('');
    animateToStep('info');
  };

  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (needsPassword === '1' && !canSubmitPassword) {
        setError(t('setPassword.validationError'));
      } else {
        setError(t('completeProfile.nameError'));
      }
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    const fullPhone = telephone.trim().length > 0 ? `${country.dial}${telephone.trim()}` : undefined;
    const isoDate = dateNaissance.length === 10 ? toIsoDate(dateNaissance) : undefined;
    const pw = needsPassword === '1' ? password : undefined;
    const result = await completeProfile(prenom.trim(), nom.trim(), true, fullPhone, isoDate, pw);
    submittingRef.current = false;
    setIsLoading(false);
    if (result.success) {
      await AsyncStorage.setItem('showGuidBadge', '1');
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

  const stepIndex = STEPS.indexOf(step);

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bgCard }]}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Progress bar (only shown for multi-step flows) */}
            {STEPS.length > 1 && (
            <Animated.View style={[styles.progressBar, {
              opacity: headerAnim,
            }]}>
              <View style={[styles.progressTrack, { backgroundColor: `${palette.violet}15` }]}>
                <Animated.View style={[styles.progressFill, {
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  backgroundColor: palette.violet,
                }]} />
              </View>
              <Text style={[styles.progressText, { color: theme.textMuted }]}>
                {t('completeProfile.stepOf', { current: stepIndex + 1, total: STEPS.length })}
              </Text>
            </Animated.View>
            )}

            {/* Header */}
            <Animated.View style={[styles.header, {
              opacity: headerAnim,
              transform: [
                { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
              ],
            }]}>
              <Animated.View style={[styles.iconCircle, { backgroundColor: palette.violetUltraLight, borderColor: palette.violetSoft, transform: [{ scale: pulseAnim }] }]}>
                <Image
                  source={require('@/assets/images/jitpluslogo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
                <BrandText size={16} />
              </Animated.View>
              <Text style={[styles.title, { color: palette.gray900 }]}>
                {step === 'info' ? t('completeProfile.createProfileTitle') : t('completeProfile.passwordStepTitle')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.gray500 }]}>
                {step === 'info'
                  ? t('completeProfile.nameSubtitle')
                  : t('completeProfile.passwordStepSubtitle')}
              </Text>
            </Animated.View>

            {/* Card */}
            <Animated.View style={[styles.card, {
              backgroundColor: theme.bgCard,
              opacity: cardAnim,
              transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            }]}>
              {step === 'info' ? (
                <>
                  {/* Preview avatar */}
                  {prenom.trim().length > 0 && (
                    <View style={styles.previewRow}>
                      <LinearGradient
                        colors={[palette.gold, palette.violetVivid]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.previewAvatar}
                      >
                        <Text style={styles.previewInitials}>
                          {(prenom.charAt(0) + (nom.charAt(0) || '')).toUpperCase()}
                        </Text>
                      </LinearGradient>
                      <View style={styles.previewInfo}>
                        <Text style={[styles.previewName, { color: theme.text }]} numberOfLines={1}>
                          {prenom.trim()} {nom.trim()}
                        </Text>
                        <Text style={[styles.previewLabel, { color: theme.textMuted }]}>
                          {t('completeProfile.profilePreview')}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Prénom */}
                  <View style={styles.fieldContainer}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('completeProfile.firstName')}</Text>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.bgInput,
                      borderColor: prenom.trim().length >= 2 ? palette.violet : theme.border,
                    }]}>
                      <User size={ms(18)} color={prenom.trim().length >= 2 ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder={t('completeProfile.firstNamePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={prenom}
                        onChangeText={(val) => { setPrenom(sanitizeName(val)); clearError(); }}
                        autoFocus
                        autoCapitalize="words"
                        maxLength={50}
                        returnKeyType="next"
                        onSubmitEditing={() => nomInputRef.current?.focus()}
                      />
                      {prenom.trim().length >= 2 && (
                        <CheckCircle2 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                      )}
                    </View>
                  </View>

                  {/* Nom */}
                  <View style={styles.fieldContainer}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('completeProfile.lastName')}</Text>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.bgInput,
                      borderColor: nom.trim().length >= 2 ? palette.violet : theme.border,
                    }]}>
                      <User size={ms(18)} color={nom.trim().length >= 2 ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        ref={nomInputRef}
                        style={[styles.input, { color: theme.text }]}
                        placeholder={t('completeProfile.lastNamePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={nom}
                        onChangeText={(val) => { setNom(sanitizeName(val)); clearError(); }}
                        autoCapitalize="words"
                        maxLength={50}
                        returnKeyType={showPhoneField ? 'next' : 'done'}
                        onSubmitEditing={() => showPhoneField ? phoneInputRef.current?.focus() : handleNext()}
                      />
                      {nom.trim().length >= 2 && (
                        <CheckCircle2 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                      )}
                    </View>
                  </View>

                  {/* Téléphone (only for email-registered users) */}
                  {showPhoneField && (
                    <View style={styles.fieldContainer}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>
                        {t('completeProfile.phone')}{' '}
                        <Text style={{ fontWeight: '400', color: theme.textMuted }}>({t('profile.optional')})</Text>
                      </Text>
                      <View style={[styles.inputWrapper, {
                        backgroundColor: theme.bgInput,
                        borderColor: isPhoneValid && telephone.trim().length > 0 ? palette.violet : theme.border,
                      }]}>
                        <CountryCodePicker selected={country} onSelect={(c) => { setCountry(c); setTelephone(''); clearError(); }} accentColor={palette.violet} />
                        <View style={styles.phoneSeparator} />
                        <TextInput
                          ref={phoneInputRef}
                          style={[styles.input, { color: theme.text }]}
                          placeholder={'X'.repeat(country.maxDigits)}
                          placeholderTextColor={theme.textMuted}
                          value={telephone}
                          onChangeText={(val) => { setTelephone(val.replace(/[^0-9]/g, '')); clearError(); }}
                          keyboardType="phone-pad"
                          maxLength={country.maxDigits}
                          returnKeyType="done"
                          onSubmitEditing={handleNext}
                        />
                        {isPhoneValid && telephone.trim().length > 0 && (
                          <CheckCircle2 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                        )}
                      </View>
                    </View>
                  )}

                  {/* Date de naissance (optionnelle) */}
                  <View style={styles.fieldContainer}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>
                      {t('completeProfile.dateNaissance')}{' '}
                      <Text style={{ fontWeight: '400', color: theme.textMuted }}>(optionnel)</Text>
                    </Text>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.bgInput,
                      borderColor: dateNaissance.length === 10 && toIsoDate(dateNaissance) ? palette.violet : theme.border,
                    }]}>
                      <Calendar
                        size={ms(18)}
                        color={dateNaissance.length === 10 && toIsoDate(dateNaissance) ? palette.violet : theme.textMuted}
                        strokeWidth={1.5}
                      />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder={t('completeProfile.dateNaissancePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={dateNaissance}
                        onChangeText={(val) => setDateNaissance(formatDateInput(val))}
                        keyboardType="number-pad"
                        maxLength={10}
                        returnKeyType="done"
                      />
                      {dateNaissance.length === 10 && toIsoDate(dateNaissance) && (
                        <CheckCircle2 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                      )}
                    </View>
                  </View>

                  {/* Hint */}
                  <View style={[styles.hintBox, { backgroundColor: `${palette.violet}08` }]}>
                    <Sparkles size={ms(14)} color={palette.violet} strokeWidth={1.5} />
                    <Text style={[styles.hintText, { color: theme.textMuted }]}>
                      {t('completeProfile.infoHint')}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  {/* Password */}
                  <View style={styles.fieldContainer}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('setPassword.placeholder')}</Text>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.bgInput,
                      borderColor: error && !isValidPassword ? theme.danger : isValidPassword ? palette.violet : theme.border,
                      borderWidth: isValidPassword ? 2 : 1.5,
                    }]}>
                      <Lock size={ms(18)} color={isValidPassword ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder={t('setPassword.placeholder')}
                        placeholderTextColor={theme.textMuted}
                        value={password}
                        onChangeText={(val) => { setPasswordValue(val); clearError(); }}
                        secureTextEntry={!showPasswordField}
                        autoCapitalize="none"
                        autoFocus
                        returnKeyType="next"
                        onSubmitEditing={() => confirmRef.current?.focus()}
                      />
                      <TouchableOpacity onPress={() => setShowPasswordField(!showPasswordField)} activeOpacity={0.7}>
                        {showPasswordField ? (
                          <EyeOff size={ms(20)} color={theme.textMuted} strokeWidth={1.5} />
                        ) : (
                          <Eye size={ms(20)} color={theme.textMuted} strokeWidth={1.5} />
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

                  {/* Confirm Password */}
                  <View style={styles.fieldContainer}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('setPassword.confirmPlaceholder')}</Text>
                    <View style={[styles.inputWrapper, {
                      backgroundColor: theme.bgInput,
                      borderColor: error && !passwordsMatch ? theme.danger : passwordsMatch ? palette.violet : theme.border,
                      borderWidth: passwordsMatch ? 2 : 1.5,
                    }]}>
                      <CheckCircle2 size={ms(18)} color={passwordsMatch ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        ref={confirmRef}
                        style={[styles.input, { color: theme.text }]}
                        placeholder={t('setPassword.confirmPlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={confirmPassword}
                        onChangeText={(val) => { setConfirmPassword(val); clearError(); }}
                        secureTextEntry={!showConfirm}
                        autoCapitalize="none"
                        returnKeyType="done"
                        onSubmitEditing={canSubmitPassword ? handleSubmit : undefined}
                      />
                      <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} activeOpacity={0.7}>
                        {showConfirm ? (
                          <EyeOff size={ms(20)} color={theme.textMuted} strokeWidth={1.5} />
                        ) : (
                          <Eye size={ms(20)} color={theme.textMuted} strokeWidth={1.5} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Hint */}
                  <View style={[styles.hintBox, { backgroundColor: `${palette.violet}08` }]}>
                    <Sparkles size={ms(14)} color={palette.violet} strokeWidth={1.5} />
                    <Text style={[styles.hintText, { color: theme.textMuted }]}>
                      {t('setPassword.subtitle')}
                    </Text>
                  </View>
                </>
              )}

              {/* Error */}
              <FormError message={error} />

              {/* Buttons */}
              <View style={styles.buttonRow}>
                {step === 'password' && (
                  <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={[styles.backBtn, { backgroundColor: theme.bgInput }]} accessibilityRole="button" accessibilityLabel={t('common.back')}>
                    <ChevronLeft size={ms(20)} color={theme.text} strokeWidth={1.5} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={step === 'info' && STEPS.length > 1 ? handleNext : handleSubmit}
                  disabled={isLoading}
                  activeOpacity={0.85}
                  style={{ flex: 1 }}
                >
                  <LinearGradient
                    colors={
                      step === 'info'
                        ? (canGoNext ? [palette.violet, palette.violetDark] : ['#D4D0E8', '#C4BFD9'])
                        : (canSubmitPassword ? [palette.violet, palette.violetDark] : ['#D4D0E8', '#C4BFD9'])
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.button}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={[styles.buttonText, {
                          opacity: (step === 'info' ? canGoNext : canSubmitPassword) ? 1 : 0.5,
                        }]}>
                          {step === 'info' && STEPS.length > 1 ? t('completeProfile.continue') : t('completeProfile.createAccount')}
                        </Text>
                        <ArrowRight size={ms(18)} color={
                          (step === 'info' ? canGoNext : canSubmitPassword) ? '#fff' : 'rgba(255,255,255,0.5)'
                        } />
                      </>
                    )}
                  </LinearGradient>
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
  scrollView: { flex: 1 },
  scrollContent: { justifyContent: 'center', paddingHorizontal: wp(24), paddingVertical: hp(20), flexGrow: 1 },
  keyboardView: { flex: 1 },



  // Progress
  progressBar: { marginBottom: hp(16), alignItems: 'center' },
  progressTrack: {
    width: '60%', height: ms(4), borderRadius: ms(2),
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: ms(2),
  },
  progressText: {
    fontSize: ms(11),
    marginTop: hp(6), fontWeight: '600',
  },

  // Header
  header: { alignItems: 'center', marginBottom: hp(24) },
  iconCircle: {
    flexDirection: 'row',
    paddingHorizontal: ms(16), height: ms(56), borderRadius: ms(28),
    borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', marginBottom: hp(16),
    gap: ms(6),
  },
  logoImage: { width: ms(32), height: ms(32) },
  title: { fontSize: fontSize['3xl'], fontWeight: '700', marginBottom: hp(8), letterSpacing: -0.3 },
  subtitle: { fontSize: fontSize.md, textAlign: 'center', fontWeight: '500', lineHeight: ms(22) },

  // Card
  card: {
    borderRadius: radius['2xl'], padding: wp(24),
    shadowColor: '#000', shadowOffset: { width: 0, height: hp(4) },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 8,
  },

  // Preview row
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    marginBottom: hp(22), paddingBottom: hp(18),
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  previewAvatar: {
    width: ms(48), height: ms(48), borderRadius: ms(24),
    alignItems: 'center', justifyContent: 'center',
  },
  previewInitials: { fontSize: fontSize.lg, fontWeight: '700', color: '#fff' },
  previewInfo: { flex: 1 },
  previewName: { fontSize: fontSize.lg, fontWeight: '700', letterSpacing: -0.2 },
  previewLabel: { fontSize: fontSize.xs, marginTop: hp(2) },

  // Fields
  fieldContainer: { marginBottom: hp(16) },
  label: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: hp(8), marginLeft: wp(4) },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    borderRadius: radius.lg, borderWidth: 1.5,
    paddingHorizontal: wp(16), height: hp(54),
  },
  input: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  phoneSeparator: { width: 1, height: '60%', backgroundColor: '#E0E0E0' },

  // Hint
  hintBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(10),
    paddingHorizontal: wp(14), paddingVertical: hp(12),
    borderRadius: radius.md, marginTop: hp(4), marginBottom: hp(4),
  },
  hintText: { flex: 1, fontSize: fontSize.xs, lineHeight: ms(18) },

  // Password strength
  strengthContainer: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    marginBottom: hp(16), paddingHorizontal: wp(4),
  },
  strengthBarTrack: {
    flex: 1, height: ms(4), borderRadius: ms(2),
    backgroundColor: '#E5E7EB', overflow: 'hidden',
  },
  strengthBarFill: {
    height: '100%', borderRadius: ms(2),
  },
  strengthLabel: {
    fontSize: fontSize.xs, fontWeight: '600',
  },



  // Buttons
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10), marginTop: hp(8) },
  backBtn: {
    width: ms(50), height: hp(56), borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center',
  },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.xl, height: hp(56), gap: wp(8),
  },
  buttonText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700', letterSpacing: 0.3 },
});
