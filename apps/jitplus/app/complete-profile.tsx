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
  User, ArrowRight, CheckCircle2, Sparkles, Shield, ChevronLeft, Calendar,
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

const STEPS = ['info', 'terms'] as const;
type Step = typeof STEPS[number];

/** Strip anything that isn't a letter, accent, space, hyphen or apostrophe */
const sanitizeName = (text: string) => text.replace(/[^a-zA-Z\u00C0-\u024F\s'-]/g, '');

export default function CompleteProfileScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { completeProfile, client } = useAuth();
  const { needsPassword } = useLocalSearchParams<{ needsPassword?: string }>();
  const needsPhone = !client?.telephone;
  const [step, setStep] = useState<Step>('info');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [dateNaissance, setDateNaissance] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
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

  const isPhoneValid = !needsPhone || isValidPhoneForCountry(telephone, country);
  const canGoNext = prenom.trim().length >= 2 && nom.trim().length >= 2 && isPhoneValid;
  const canSubmit = canGoNext && termsAccepted;

  const handleNext = () => {
    if (prenom.trim().length < 2 || nom.trim().length < 2) {
      setError(t('completeProfile.nameError'));
      return;
    }
    if (needsPhone && !isPhoneValid) {
      setError(t('completeProfile.phoneError'));
      return;
    }
    setError('');
    animateToStep('terms');
  };

  const handleBack = () => {
    setError('');
    animateToStep('info');
  };

  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError(t('completeProfile.termsError'));
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    const fullPhone = needsPhone ? `${country.dial}${telephone.trim()}` : undefined;
    const isoDate = dateNaissance.length === 10 ? toIsoDate(dateNaissance) : undefined;
    const result = await completeProfile(prenom.trim(), nom.trim(), termsAccepted, fullPhone, isoDate);
    submittingRef.current = false;
    setIsLoading(false);
    if (result.success) {
      await AsyncStorage.setItem('showGuidBadge', '1');
      if (needsPassword === '1') {
        router.replace('/set-password');
      } else {
        router.replace('/(tabs)/qr');
      }
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
            {/* Progress bar */}
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
                {step === 'info' ? t('completeProfile.createProfileTitle') : t('completeProfile.lastStepTitle')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.gray500 }]}>
                {step === 'info'
                  ? t('completeProfile.nameSubtitle')
                  : t('completeProfile.termsSubtitle')}
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
                        returnKeyType={needsPhone ? 'next' : 'done'}
                        onSubmitEditing={() => needsPhone ? phoneInputRef.current?.focus() : handleNext()}
                      />
                      {nom.trim().length >= 2 && (
                        <CheckCircle2 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                      )}
                    </View>
                  </View>

                  {/* Téléphone (only for email-registered users) */}
                  {needsPhone && (
                    <View style={styles.fieldContainer}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>{t('completeProfile.phone')}</Text>
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
                        returnKeyType={needsPhone ? 'done' : 'done'}
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
                  {/* Summary */}
                  <View style={[styles.summaryCard, { backgroundColor: theme.bgInput }]}>
                    <LinearGradient
                      colors={[palette.gold, palette.violetVivid]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.summaryAvatar}
                    >
                      <Text style={styles.summaryInitials}>
                        {(prenom.charAt(0) + nom.charAt(0)).toUpperCase()}
                      </Text>
                    </LinearGradient>
                    <Text style={[styles.summaryName, { color: theme.text }]}>
                      {prenom.trim()} {nom.trim()}
                    </Text>
                    <Text style={[styles.summaryBadge, { color: palette.violet }]}>
                      {t('completeProfile.newMember')}
                    </Text>
                  </View>

                  {/* Terms checkbox */}
                  <TouchableOpacity
                    onPress={() => { setTermsAccepted(!termsAccepted); setError(''); }}
                    activeOpacity={0.7}
                    style={[styles.termsCard, {
                      backgroundColor: termsAccepted ? `${palette.violet}08` : theme.bgInput,
                      borderColor: termsAccepted ? palette.violet : theme.border,
                    }]}
                  >
                    <View style={[styles.checkbox, {
                      borderColor: termsAccepted ? palette.violet : theme.border,
                      backgroundColor: termsAccepted ? palette.violet : 'transparent',
                    }]}>
                      {termsAccepted && <CheckCircle2 size={ms(18)} color="#fff" strokeWidth={1.5} />}
                    </View>
                    <View style={styles.termsText}>
                      <Text style={[styles.termsLabel, { color: theme.text }]}>
                        {t('completeProfile.acceptTerms')}{' '}
                        <Text
                          style={{ fontWeight: '700', color: palette.violet, textDecorationLine: 'underline' }}
                          onPress={() => router.push('/legal')}
                        >
                          {t('completeProfile.legalNotice')}
                        </Text>
                      </Text>
                      <Text style={[styles.termsDesc, { color: theme.textMuted }]}>
                        {t('completeProfile.dataPrivacy')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Security note */}
                  <View style={[styles.hintBox, { backgroundColor: `#10B98108` }]}>
                    <Shield size={ms(14)} color="#10B981" strokeWidth={1.5} />
                    <Text style={[styles.hintText, { color: theme.textMuted }]}>
                      {t('completeProfile.dataSecurity')}
                    </Text>
                  </View>
                </>
              )}

              {/* Error */}
              <FormError message={error} />

              {/* Buttons */}
              <View style={styles.buttonRow}>
                {step === 'terms' && (
                  <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={[styles.backBtn, { backgroundColor: theme.bgInput }]} accessibilityRole="button" accessibilityLabel={t('common.back')}>
                    <ChevronLeft size={ms(20)} color={theme.text} strokeWidth={1.5} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={step === 'info' ? handleNext : handleSubmit}
                  disabled={isLoading}
                  activeOpacity={0.85}
                  style={{ flex: 1 }}
                >
                  <LinearGradient
                    colors={
                      step === 'info'
                        ? (canGoNext ? [palette.violet, palette.violetDark] : ['#D4D0E8', '#C4BFD9'])
                        : (canSubmit ? [palette.violet, palette.violetDark] : ['#D4D0E8', '#C4BFD9'])
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
                          opacity: (step === 'info' ? canGoNext : canSubmit) ? 1 : 0.5,
                        }]}>
                          {step === 'info' ? t('completeProfile.continue') : t('completeProfile.createAccount')}
                        </Text>
                        <ArrowRight size={ms(18)} color={
                          (step === 'info' ? canGoNext : canSubmit) ? '#fff' : 'rgba(255,255,255,0.5)'
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

  // Summary
  summaryCard: {
    borderRadius: radius.xl, padding: wp(20), alignItems: 'center',
    marginBottom: hp(20),
  },
  summaryAvatar: {
    width: ms(64), height: ms(64), borderRadius: ms(32),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(12),
  },
  summaryInitials: { fontSize: fontSize['2xl'], fontWeight: '700', color: '#fff' },
  summaryName: { fontSize: fontSize.xl, fontWeight: '700', letterSpacing: -0.2, marginBottom: hp(4) },
  summaryBadge: { fontSize: fontSize.sm, fontWeight: '600' },

  // Terms
  termsCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(12),
    padding: wp(16), borderRadius: radius.xl, borderWidth: 1.5,
    marginBottom: hp(16),
  },
  checkbox: {
    width: ms(24), height: ms(24), borderRadius: ms(8),
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
    marginTop: hp(2), flexShrink: 0,
  },
  termsText: { flex: 1 },
  termsLabel: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: hp(4) },
  termsDesc: { fontSize: fontSize.xs, lineHeight: ms(18) },



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
