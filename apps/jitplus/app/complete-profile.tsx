import { useState, useRef, useCallback, useMemo } from 'react';
import { View, KeyboardAvoidingView, Platform, Alert, ScrollView, Animated } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { goHomeAfterLogin } from '@/services/pendingDeal';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Gift, Shield } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import FormError from '@/components/FormError';
import { formatDateInput, toIsoDate } from '@/utils/dateInput';
import { getPasswordStrength, isValidPassword } from '@/utils/passwordStrength';
import { useCompleteProfileSteps } from '@/hooks/useCompleteProfileSteps';
import { WELCOME_FLAG_NEW } from '@/hooks/useHomeBanners';
import { ProfileHeader } from '@/components/completeProfile/ProfileHeader';
import { NameStep } from '@/components/completeProfile/NameStep';
import { PasswordStep } from '@/components/completeProfile/PasswordStep';
import { BirthdayStep } from '@/components/completeProfile/BirthdayStep';
import { BottomActionBar } from '@/components/completeProfile/BottomActionBar';
import { s, ACTIVE_COLORS, GRAD_START, GRAD_END_DIAG, ICON_20 } from '@/components/completeProfile/styles';

const RE_NAME_STRIP = /[^\p{L}\p{M}\s'-]/gu;

const sanitizeName = (text: string) => text.replace(RE_NAME_STRIP, '');

const STEP_ICONS = [User, Shield, Gift];

export default function CompleteProfileScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { completeProfile, client } = useAuth();
  const { needsPassword } = useLocalSearchParams<{ needsPassword?: string; isGoogleUser?: string }>();
  const showPasswordStep = needsPassword === '1';

  const { step, error, setError, scrollRef, animateStep, stepStyle, headerStyle } = useCompleteProfileSteps();
  const [prenom, setPrenom] = useState(client?.prenom ?? '');
  const [nom, setNom] = useState(client?.nom ?? '');
  const [dateNaissance, setDateNaissance] = useState('');
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const nomRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);

  // Email users: name → password → birthday
  // Google users: name → phone → birthday
  const visibleSteps = [0, 1, 2];
  const visibleStepIndex = visibleSteps.indexOf(step);
  const displayTotal = visibleSteps.length;

  const strength = useMemo(() => getPasswordStrength(password, t), [password, t]);

  const prenomTrimmed = prenom.trim();
  const nomTrimmed = nom.trim();
  const prenomOk = prenomTrimmed.length >= 2;
  const nomOk = nomTrimmed.length >= 2;
  const isValidPw = isValidPassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const dateValid = dateNaissance.length === 10 && !!toIsoDate(dateNaissance);

  const canNextStep0 = prenomOk && nomOk;
  const canNextStep1 = showPasswordStep ? (isValidPw && passwordsMatch) : true;

  const onPrenomChange = useCallback((v: string) => { setPrenom(sanitizeName(v)); setError(''); }, [setError]);
  const onNomChange = useCallback((v: string) => { setNom(sanitizeName(v)); setError(''); }, [setError]);
  const onDateChange = useCallback((v: string) => setDateNaissance(formatDateInput(v)), []);
  const onPwChange = useCallback((v: string) => { setPasswordValue(v); setError(''); }, [setError]);
  const onConfirmChange = useCallback((v: string) => { setConfirmPassword(v); setError(''); }, [setError]);
  const toggleShowPw = useCallback(() => setShowPw(v => !v), []);
  const toggleShowConfirm = useCallback(() => setShowConfirm(v => !v), []);
  const toggleTerms = useCallback(() => { setTermsAccepted((v) => !v); setError(''); }, [setError]);

  const goNext = useCallback(() => {
    if (step === 0) {
      if (!canNextStep0) { setError(t('completeProfile.nameError')); return; }
      animateStep(1);
    } else if (step === 1) {
      if (showPasswordStep && !canNextStep1) { setError(t('setPassword.validationError')); return; }
      animateStep(2);
    }
  }, [step, canNextStep0, canNextStep1, showPasswordStep, animateStep, setError, t]);

  const goBack = useCallback(() => {
    if (step > 0) {
      animateStep(step - 1);
    }
  }, [step, animateStep]);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (!termsAccepted) { setError(t('register.termsRequired')); return; }
    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    const isoDate = dateNaissance.length === 10 ? toIsoDate(dateNaissance) : undefined;
    const pw = showPasswordStep ? password : undefined;
    const result = await completeProfile(prenomTrimmed, nomTrimmed, termsAccepted, undefined, isoDate, pw);
    submittingRef.current = false;
    setIsLoading(false);
    if (result.success) {
      await AsyncStorage.setItem('showGuidBadge', '1');
      await AsyncStorage.setItem('showWelcome', WELCOME_FLAG_NEW);
      goHomeAfterLogin(router);
    } else {
      if (result.isNetworkError) {
        Alert.alert(t('common.networkError'), result.error);
      } else {
        setError(result.error || t('common.genericError'));
      }
    }
  }, [prenomTrimmed, nomTrimmed, dateNaissance, showPasswordStep, password, termsAccepted, completeProfile, setError, t]);

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

  const StepIcon = STEP_ICONS[step];

  const canProceed = step === 0 ? canNextStep0 : step === 1 ? canNextStep1 : termsAccepted;

  return (
    <View style={[s.root, { backgroundColor: '#fff' }]}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.kav}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            ref={scrollRef}
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <ProfileHeader
              headerStyle={headerStyle}
              visibleSteps={visibleSteps}
              step={step}
              visibleStepIndex={visibleStepIndex}
              displayTotal={displayTotal}
              theme={theme}
              t={t}
            />

            <Animated.View style={[s.card, { backgroundColor: theme.bgCard }, stepStyle]}>
              <View style={s.stepHeader}>
                <LinearGradient colors={ACTIVE_COLORS} start={GRAD_START} end={GRAD_END_DIAG} style={s.stepIconCircle}>
                  <StepIcon size={ICON_20} color="#fff" strokeWidth={2} />
                </LinearGradient>
                <Text style={[s.stepTitle, { color: theme.text }]}>{stepTitles[step]}</Text>
                <Text style={[s.stepSubtitle, { color: theme.textMuted }]}>{stepSubtitles[step]}</Text>
              </View>

              {step === 0 && (
                <NameStep
                  theme={theme} t={t}
                  prenom={prenom} nom={nom}
                  prenomTrimmed={prenomTrimmed} nomTrimmed={nomTrimmed}
                  prenomOk={prenomOk} nomOk={nomOk} canNext={canNextStep0}
                  nomRef={nomRef}
                  onPrenomChange={onPrenomChange} onNomChange={onNomChange} onNext={goNext}
                />
              )}

              {step === 1 && (
                <PasswordStep
                  theme={theme} t={t}
                  showPasswordStep={showPasswordStep}
                  password={password} confirmPassword={confirmPassword}
                  isValidPw={isValidPw} passwordsMatch={passwordsMatch} canNext={canNextStep1}
                  showPw={showPw} showConfirm={showConfirm} strength={strength}
                  pwRef={pwRef} confirmRef={confirmRef}
                  onPwChange={onPwChange} onConfirmChange={onConfirmChange}
                  onToggleShowPw={toggleShowPw} onToggleShowConfirm={toggleShowConfirm}
                  onNext={goNext}
                />
              )}

              {step === 2 && (
                <BirthdayStep
                  theme={theme} t={t}
                  dateNaissance={dateNaissance} dateValid={dateValid}
                  termsAccepted={termsAccepted}
                  onDateChange={onDateChange} onToggleTerms={toggleTerms}
                />
              )}

              <FormError message={error} />
            </Animated.View>
          </ScrollView>

          <BottomActionBar
            theme={theme} t={t}
            step={step}
            isLoading={isLoading}
            canProceed={canProceed}
            hasDate={dateNaissance.length > 0}
            onBack={goBack}
            onPrimary={step < 2 ? goNext : handleSubmit}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
