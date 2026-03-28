import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView, Animated, Easing, Image,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User, ArrowRight, ArrowLeft, CheckCircle2, Sparkles, Calendar,
  Lock, Eye, EyeOff, Gift, Shield, Info,
} from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import BrandText from '@/components/BrandText';
import FormError from '@/components/FormError';
import { formatDateInput, toIsoDate } from '@/utils/dateInput';
import { getPasswordStrength, isValidPassword } from '@/utils/passwordStrength';

const RE_NAME_STRIP = /[^a-zA-Z\u00C0-\u024F\s'-]/g;

const sanitizeName = (text: string) => text.replace(RE_NAME_STRIP, '');

const GRAD_START = { x: 0, y: 0 } as const;
const GRAD_END_HORIZ = { x: 1, y: 0 } as const;
const GRAD_END_DIAG = { x: 1, y: 1 } as const;
const ACTIVE_COLORS: [string, string] = [palette.violet, palette.violetDark];
const DISABLED_COLORS: [string, string] = ['#D4D0E8', '#C4BFD9'];
const AVATAR_COLORS: [string, string] = [palette.gold, palette.violetVivid];

const ICON_20 = ms(20);
const ICON_18 = ms(18);
const ICON_16 = ms(16);
const ICON_14 = ms(14);

const TOTAL_STEPS = 3;

/* ── Sub-components ── */

const StrengthBar = memo(function StrengthBar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <View style={s.strengthRow}>
      <View style={s.strengthTrack}>
        <View style={[s.strengthFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.strengthLabel, { color }]}>{label}</Text>
    </View>
  );
});

const StepDot = memo(function StepDot({ index, current, theme }: { index: number; current: number; theme: any }) {
  const active = index <= current;
  return (
    <View style={[s.stepDot, { backgroundColor: active ? palette.violet : theme.border }]}>
      {index < current && <CheckCircle2 size={ms(12)} color="#fff" strokeWidth={2.5} />}
      {index === current && <View style={s.stepDotInner} />}
    </View>
  );
});

const StepLine = memo(function StepLine({ filled, theme }: { filled: boolean; theme: any }) {
  return <View style={[s.stepLine, { backgroundColor: filled ? palette.violet : theme.border }]} />;
});

export default function CompleteProfileScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { completeProfile, client } = useAuth();
  const { needsPassword } = useLocalSearchParams<{ needsPassword?: string }>();
  const showPasswordStep = needsPassword === '1';

  const [step, setStep] = useState(0);
  const [prenom, setPrenom] = useState(client?.prenom ?? '');
  const [nom, setNom] = useState(client?.nom ?? '');
  const [dateNaissance, setDateNaissance] = useState('');
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;

  const nomRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const strength = useMemo(() => getPasswordStrength(password, t), [password, t]);

  // Header entrance
  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step transition animation
  const animateStep = useCallback((next: number) => {
    const dir = next > step ? 1 : -1;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: dir * -40, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      setError('');
      slideAnim.setValue(dir * 40);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.parallel([
        Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4 }),
      ]).start();
    });
  }, [step, fadeAnim, slideAnim]);

  // Derived validations
  const prenomTrimmed = prenom.trim();
  const nomTrimmed = nom.trim();
  const prenomOk = prenomTrimmed.length >= 2;
  const nomOk = nomTrimmed.length >= 2;
  const isValidPw = isValidPassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const dateValid = dateNaissance.length === 10 && !!toIsoDate(dateNaissance);

  const canNextStep0 = prenomOk && nomOk;
  const canNextStep1 = showPasswordStep ? (isValidPw && passwordsMatch) : true;

  // Callbacks
  const onPrenomChange = useCallback((v: string) => { setPrenom(sanitizeName(v)); setError(''); }, []);
  const onNomChange = useCallback((v: string) => { setNom(sanitizeName(v)); setError(''); }, []);
  const onDateChange = useCallback((v: string) => setDateNaissance(formatDateInput(v)), []);
  const onPwChange = useCallback((v: string) => { setPasswordValue(v); setError(''); }, []);
  const onConfirmChange = useCallback((v: string) => { setConfirmPassword(v); setError(''); }, []);

  const goNext = useCallback(() => {
    if (step === 0) {
      if (!canNextStep0) { setError(t('completeProfile.nameError')); return; }
      animateStep(1);
    } else if (step === 1) {
      if (showPasswordStep && !canNextStep1) { setError(t('setPassword.validationError')); return; }
      animateStep(2);
    }
  }, [step, canNextStep0, canNextStep1, showPasswordStep, animateStep, t]);

  const goBack = useCallback(() => {
    if (step > 0) animateStep(step - 1);
  }, [step, animateStep]);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    const isoDate = dateNaissance.length === 10 ? toIsoDate(dateNaissance) : undefined;
    const pw = showPasswordStep ? password : undefined;
    const result = await completeProfile(prenomTrimmed, nomTrimmed, true, undefined, isoDate, pw);
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
  }, [prenomTrimmed, nomTrimmed, dateNaissance, showPasswordStep, password, completeProfile, t]);

  // Animated style
  const stepStyle = useMemo(() => ({
    opacity: fadeAnim,
    transform: [{ translateX: slideAnim }],
  }), [fadeAnim, slideAnim]);

  const headerStyle = useMemo(() => ({
    opacity: headerAnim,
    transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
  }), [headerAnim]);

  // Step titles & subtitles
  const stepTitles = useMemo(() => [
    t('completeProfile.step1Title'),
    t('completeProfile.step2Title'),
    t('completeProfile.step3Title'),
  ], [t]);

  const stepSubtitles = useMemo(() => [
    t('completeProfile.step1Subtitle'),
    t('completeProfile.step2Subtitle'),
    t('completeProfile.step3Subtitle'),
  ], [t]);

  const stepIcons = [User, Shield, Gift];
  const StepIcon = stepIcons[step];

  const btnColors = (step === 0 ? canNextStep0 : step === 1 ? canNextStep1 : true) ? ACTIVE_COLORS : DISABLED_COLORS;
  const canProceed = step === 0 ? canNextStep0 : step === 1 ? canNextStep1 : true;

  return (
    <View style={[s.root, { backgroundColor: '#fff' }]}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.kav}
        >
          <ScrollView
            ref={scrollRef}
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <Animated.View style={[s.header, headerStyle]}>
              <View style={s.logoRow}>
                <Image source={require('@/assets/images/jitpluslogo.png')} style={s.logo} resizeMode="contain" />
                <BrandText size={18} />
              </View>

              {/* Step indicator */}
              <View style={s.stepIndicator}>
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <View key={i} style={s.stepGroup}>
                    {i > 0 && <StepLine filled={i <= step} theme={theme} />}
                    <StepDot index={i} current={step} theme={theme} />
                  </View>
                ))}
              </View>
              <Text style={s.stepCounter}>
                {t('completeProfile.stepOf', { current: step + 1, total: TOTAL_STEPS })}
              </Text>
            </Animated.View>

            {/* Step content */}
            <Animated.View style={[s.card, { backgroundColor: theme.bgCard }, stepStyle]}>
              {/* Step header icon + title */}
              <View style={s.stepHeader}>
                <LinearGradient colors={ACTIVE_COLORS} start={GRAD_START} end={GRAD_END_DIAG} style={s.stepIconCircle}>
                  <StepIcon size={ICON_20} color="#fff" strokeWidth={2} />
                </LinearGradient>
                <Text style={[s.stepTitle, { color: theme.text }]}>{stepTitles[step]}</Text>
                <Text style={[s.stepSubtitle, { color: theme.textMuted }]}>{stepSubtitles[step]}</Text>
              </View>

              {/* ── Step 0: Nom / Prénom ── */}
              {step === 0 && (
                <View>
                  {/* Live avatar preview */}
                  {prenomTrimmed.length > 0 && (
                    <View style={s.avatarRow}>
                      <LinearGradient colors={AVATAR_COLORS} start={GRAD_START} end={GRAD_END_DIAG} style={s.avatar}>
                        <Text style={s.initials}>
                          {(prenomTrimmed.charAt(0) + (nomTrimmed.charAt(0) || '')).toUpperCase()}
                        </Text>
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.avatarName, { color: theme.text }]} numberOfLines={1}>
                          {prenomTrimmed} {nomTrimmed}
                        </Text>
                        <Text style={[s.avatarLabel, { color: theme.textMuted }]}>
                          {t('completeProfile.profilePreview')}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={s.field}>
                    <Text style={[s.label, { color: theme.textSecondary }]}>{t('completeProfile.firstName')}</Text>
                    <View style={[s.inputWrap, {
                      backgroundColor: theme.bgInput,
                      borderColor: prenomOk ? palette.violet : theme.border,
                    }]}>
                      <User size={ICON_18} color={prenomOk ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        style={[s.input, { color: theme.text }]}
                        placeholder={t('completeProfile.firstNamePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={prenom}
                        onChangeText={onPrenomChange}
                        autoFocus
                        autoCapitalize="words"
                        maxLength={50}
                        returnKeyType="next"
                        onSubmitEditing={() => nomRef.current?.focus()}
                      />
                      {prenomOk && <CheckCircle2 size={ICON_16} color={palette.violet} strokeWidth={1.5} />}
                    </View>
                  </View>

                  <View style={s.field}>
                    <Text style={[s.label, { color: theme.textSecondary }]}>{t('completeProfile.lastName')}</Text>
                    <View style={[s.inputWrap, {
                      backgroundColor: theme.bgInput,
                      borderColor: nomOk ? palette.violet : theme.border,
                    }]}>
                      <User size={ICON_18} color={nomOk ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        ref={nomRef}
                        style={[s.input, { color: theme.text }]}
                        placeholder={t('completeProfile.lastNamePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={nom}
                        onChangeText={onNomChange}
                        autoCapitalize="words"
                        maxLength={50}
                        returnKeyType="done"
                        onSubmitEditing={canNextStep0 ? goNext : undefined}
                      />
                      {nomOk && <CheckCircle2 size={ICON_16} color={palette.violet} strokeWidth={1.5} />}
                    </View>
                  </View>

                  {/* Privacy info */}
                  <View style={[s.infoBox, { backgroundColor: `${palette.violet}08` }]}>
                    <Info size={ICON_16} color={palette.violet} strokeWidth={1.5} />
                    <Text style={[s.infoText, { color: theme.textMuted }]}>
                      {t('completeProfile.namePrivacyHint')}
                    </Text>
                  </View>
                </View>
              )}

              {/* ── Step 1: Password ── */}
              {step === 1 && (
                <View>
                  {showPasswordStep ? (
                    <>
                      <View style={s.field}>
                        <Text style={[s.label, { color: theme.textSecondary }]}>{t('setPassword.placeholder')}</Text>
                        <View style={[s.inputWrap, {
                          backgroundColor: theme.bgInput,
                          borderColor: isValidPw ? palette.violet : theme.border,
                          borderWidth: isValidPw ? 2 : 1.5,
                        }]}>
                          <Lock size={ICON_18} color={isValidPw ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                          <TextInput
                            ref={pwRef}
                            style={[s.input, { color: theme.text }]}
                            placeholder={t('setPassword.placeholder')}
                            placeholderTextColor={theme.textMuted}
                            value={password}
                            onChangeText={onPwChange}
                            secureTextEntry={!showPw}
                            autoCapitalize="none"
                            autoFocus
                            returnKeyType="next"
                            onSubmitEditing={() => confirmRef.current?.focus()}
                          />
                          <TouchableOpacity onPress={() => setShowPw(v => !v)} activeOpacity={0.7}>
                            {showPw
                              ? <EyeOff size={ICON_20} color={theme.textMuted} strokeWidth={1.5} />
                              : <Eye size={ICON_20} color={theme.textMuted} strokeWidth={1.5} />}
                          </TouchableOpacity>
                        </View>
                      </View>

                      {password.length > 0 && (
                        <StrengthBar pct={strength.pct} color={strength.color} label={strength.label} />
                      )}

                      <View style={s.field}>
                        <Text style={[s.label, { color: theme.textSecondary }]}>{t('setPassword.confirmPlaceholder')}</Text>
                        <View style={[s.inputWrap, {
                          backgroundColor: theme.bgInput,
                          borderColor: passwordsMatch ? palette.violet : theme.border,
                          borderWidth: passwordsMatch ? 2 : 1.5,
                        }]}>
                          <CheckCircle2 size={ICON_18} color={passwordsMatch ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                          <TextInput
                            ref={confirmRef}
                            style={[s.input, { color: theme.text }]}
                            placeholder={t('setPassword.confirmPlaceholder')}
                            placeholderTextColor={theme.textMuted}
                            value={confirmPassword}
                            onChangeText={onConfirmChange}
                            secureTextEntry={!showConfirm}
                            autoCapitalize="none"
                            returnKeyType="done"
                            onSubmitEditing={canNextStep1 ? goNext : undefined}
                          />
                          <TouchableOpacity onPress={() => setShowConfirm(v => !v)} activeOpacity={0.7}>
                            {showConfirm
                              ? <EyeOff size={ICON_20} color={theme.textMuted} strokeWidth={1.5} />
                              : <Eye size={ICON_20} color={theme.textMuted} strokeWidth={1.5} />}
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={[s.infoBox, { backgroundColor: `${palette.violet}08` }]}>
                        <Shield size={ICON_16} color={palette.violet} strokeWidth={1.5} />
                        <Text style={[s.infoText, { color: theme.textMuted }]}>
                          {t('completeProfile.passwordHint')}
                        </Text>
                      </View>
                    </>
                  ) : (
                    /* No password needed — auto-skip or show "no password needed" */
                    <View style={s.noPasswordBlock}>
                      <View style={[s.noPasswordIcon, { backgroundColor: `${palette.violet}10` }]}>
                        <CheckCircle2 size={ms(32)} color={palette.violet} strokeWidth={1.5} />
                      </View>
                      <Text style={[s.noPasswordTitle, { color: theme.text }]}>
                        {t('completeProfile.noPasswordTitle')}
                      </Text>
                      <Text style={[s.noPasswordDesc, { color: theme.textMuted }]}>
                        {t('completeProfile.noPasswordDesc')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* ── Step 2: Date de naissance (optional) ── */}
              {step === 2 && (
                <View>
                  <View style={s.field}>
                    <Text style={[s.label, { color: theme.textSecondary }]}>
                      {t('completeProfile.dateNaissance')}{' '}
                      <Text style={{ fontWeight: '400', color: theme.textMuted }}>({t('completeProfile.optional')})</Text>
                    </Text>
                    <View style={[s.inputWrap, {
                      backgroundColor: theme.bgInput,
                      borderColor: dateValid ? palette.violet : theme.border,
                    }]}>
                      <Calendar size={ICON_18} color={dateValid ? palette.violet : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        style={[s.input, { color: theme.text }]}
                        placeholder={t('completeProfile.dateNaissancePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={dateNaissance}
                        onChangeText={onDateChange}
                        keyboardType="number-pad"
                        maxLength={10}
                        autoFocus
                        returnKeyType="done"
                      />
                      {dateValid && <CheckCircle2 size={ICON_16} color={palette.violet} strokeWidth={1.5} />}
                    </View>
                  </View>

                  {/* Birthday gift info */}
                  <View style={[s.birthdayCard, { backgroundColor: `${palette.gold}12`, borderColor: `${palette.gold}30` }]}>
                    <Gift size={ICON_20} color={palette.gold} strokeWidth={1.5} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.birthdayTitle, { color: palette.gray900 }]}>
                        {t('completeProfile.birthdayGiftTitle')}
                      </Text>
                      <Text style={[s.birthdayDesc, { color: palette.gray500 }]}>
                        {t('completeProfile.birthdayGiftDesc')}
                      </Text>
                    </View>
                  </View>

                  {/* Privacy reassurance */}
                  <View style={[s.infoBox, { backgroundColor: `${palette.violet}08` }]}>
                    <Lock size={ICON_16} color={palette.violet} strokeWidth={1.5} />
                    <Text style={[s.infoText, { color: theme.textMuted }]}>
                      {t('completeProfile.birthdayPrivacy')}
                    </Text>
                  </View>
                </View>
              )}

              <FormError message={error} />
            </Animated.View>
          </ScrollView>

          {/* Bottom action bar */}
          <View style={[s.bottomBar, { borderTopColor: theme.border }]}>
            {step > 0 ? (
              <TouchableOpacity onPress={goBack} style={[s.backBtn, { borderColor: theme.border }]} activeOpacity={0.7}>
                <ArrowLeft size={ICON_20} color={theme.text} strokeWidth={1.5} />
              </TouchableOpacity>
            ) : (
              <View style={s.backBtnPlaceholder} />
            )}

            <TouchableOpacity
              onPress={step < 2 ? goNext : handleSubmit}
              disabled={isLoading}
              activeOpacity={0.85}
              style={{ flex: 1 }}
            >
              <LinearGradient colors={btnColors} start={GRAD_START} end={GRAD_END_HORIZ} style={s.mainBtn}>
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={[s.mainBtnText, { opacity: canProceed ? 1 : 0.5 }]}>
                      {step < 2
                        ? t('completeProfile.continue')
                        : dateNaissance.length > 0
                          ? t('completeProfile.createAccount')
                          : t('completeProfile.skipAndFinish')}
                    </Text>
                    <ArrowRight size={ICON_18} color={canProceed ? '#fff' : 'rgba(255,255,255,0.5)'} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(24), paddingTop: hp(16), paddingBottom: hp(24), flexGrow: 1 },

  // Header
  header: { alignItems: 'center', marginBottom: hp(20) },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: ms(6), marginBottom: hp(20) },
  logo: { width: ms(32), height: ms(32) },

  // Step indicator
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(8) },
  stepGroup: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: ms(24), height: ms(24), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotInner: {
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: '#fff',
  },
  stepLine: { width: ms(40), height: 2, borderRadius: 1 },
  stepCounter: { fontSize: fontSize.xs, color: palette.gray400, fontWeight: '500', marginTop: hp(4) },

  // Card
  card: {
    borderRadius: radius['2xl'], padding: wp(24),
    shadowColor: '#000', shadowOffset: { width: 0, height: hp(4) },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 8,
  },

  // Step header
  stepHeader: { alignItems: 'center', marginBottom: hp(24) },
  stepIconCircle: {
    width: ms(52), height: ms(52), borderRadius: ms(26),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(14),
  },
  stepTitle: { fontSize: ms(22), fontWeight: '700', letterSpacing: -0.3, marginBottom: hp(6), textAlign: 'center' },
  stepSubtitle: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20), paddingHorizontal: wp(8) },

  // Avatar preview
  avatarRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    marginBottom: hp(20), paddingBottom: hp(16),
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  avatar: {
    width: ms(48), height: ms(48), borderRadius: ms(24),
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: fontSize.lg, fontWeight: '700', color: '#fff' },
  avatarName: { fontSize: fontSize.lg, fontWeight: '700', letterSpacing: -0.2 },
  avatarLabel: { fontSize: fontSize.xs, marginTop: hp(2) },

  // Fields
  field: { marginBottom: hp(16) },
  label: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: hp(8), marginLeft: wp(4) },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    borderRadius: radius.lg, borderWidth: 1.5,
    paddingHorizontal: wp(16), height: hp(54),
  },
  input: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },

  // Info box
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(10),
    paddingHorizontal: wp(14), paddingVertical: hp(12),
    borderRadius: radius.md, marginTop: hp(4), marginBottom: hp(4),
  },
  infoText: { flex: 1, fontSize: fontSize.xs, lineHeight: ms(18) },

  // Birthday card
  birthdayCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(12),
    padding: wp(16), borderRadius: radius.lg, borderWidth: 1,
    marginBottom: hp(12),
  },
  birthdayTitle: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: hp(4) },
  birthdayDesc: { fontSize: fontSize.xs, lineHeight: ms(18) },

  // No password block
  noPasswordBlock: { alignItems: 'center', paddingVertical: hp(20) },
  noPasswordIcon: {
    width: ms(64), height: ms(64), borderRadius: ms(32),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(14),
  },
  noPasswordTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: hp(6) },
  noPasswordDesc: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20) },

  // Strength bar
  strengthRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    marginBottom: hp(16), paddingHorizontal: wp(4),
  },
  strengthTrack: {
    flex: 1, height: ms(4), borderRadius: ms(2),
    backgroundColor: '#E5E7EB', overflow: 'hidden',
  },
  strengthFill: { height: '100%', borderRadius: ms(2) },
  strengthLabel: { fontSize: fontSize.xs, fontWeight: '600' },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    paddingHorizontal: wp(24), paddingVertical: hp(12),
    borderTopWidth: 1,
  },
  backBtn: {
    width: ms(48), height: ms(48), borderRadius: ms(24),
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  backBtnPlaceholder: { width: ms(48) },
  mainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.xl, height: hp(52), gap: wp(8),
  },
  mainBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.3 },
});
