import { useState, useRef, useCallback, useMemo } from 'react';
import { View, KeyboardAvoidingView, Platform, Alert, ScrollView, Animated, BackHandler, TouchableOpacity } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { goHomeAfterLogin } from '@/services/pendingDeal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { User, Shield } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { hp, fontSize } from '@/utils/responsive';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import FormError from '@/components/FormError';
import LoginBackdrop from '@jitplus/shared/src/login/LoginBackdrop';
import { getPasswordStrength, isValidPassword } from '@/utils/passwordStrength';
import { useCompleteProfileSteps } from '@/hooks/useCompleteProfileSteps';
import { flagHomeWelcome } from '@/hooks/useHomeBanners';
import { ProfileHeader } from '@/components/completeProfile/ProfileHeader';
import { NameStep } from '@/components/completeProfile/NameStep';
import { PasswordStep } from '@/components/completeProfile/PasswordStep';
import { TermsCheckbox } from '@/components/completeProfile/TermsCheckbox';
import { BottomActionBar } from '@/components/completeProfile/BottomActionBar';
import { s, ICON_20 } from '@/components/completeProfile/styles';
import { SHOW_GUID_BADGE_KEY } from '@/constants';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const RE_NAME_STRIP = /[^\p{L}\p{M}\s'-]/gu;

const sanitizeName = (text: string) => text.replace(RE_NAME_STRIP, '');

const STEP_ICONS = [User, Shield];

/**
 * Last step of every sign-up: name, then an optional password for email
 * sign-ups (they can always log in with an email code). The birth date is
 * asked later, from the home screen.
 */
export default function CompleteProfileScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { completeProfile, client, logout } = useAuth();
  const signupTermsAccepted = useAuthStore((state) => state.signupTermsAccepted);
  const { needsPassword } = useLocalSearchParams<{ needsPassword?: string }>();
  const showPasswordStep = needsPassword === '1';

  const { step, error, setError, scrollRef, animateStep, stepStyle, headerStyle } = useCompleteProfileSteps();
  const [prenom, setPrenom] = useState(client?.prenom ?? '');
  const [nom, setNom] = useState(client?.nom ?? '');
  const [password, setPasswordValue] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(signupTermsAccepted);

  const nomRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  // The name step is counted once in the sign-up funnel, even after a back and forth.
  const nameTrackedRef = useRef(false);

  // Email sign-ups: name → password (optional). Google / Apple: name only.
  const visibleSteps = showPasswordStep ? [0, 1] : [0];
  const lastStep = visibleSteps[visibleSteps.length - 1];
  const isLastStep = step === lastStep;
  const visibleStepIndex = visibleSteps.indexOf(step);
  const displayTotal = visibleSteps.length;

  const strength = useMemo(() => getPasswordStrength(password, t), [password, t]);

  const prenomTrimmed = prenom.trim();
  const nomTrimmed = nom.trim();
  const prenomOk = prenomTrimmed.length >= 1;
  const nomOk = nomTrimmed.length >= 1;
  const isValidPw = isValidPassword(password);

  // The last name is optional.
  const canNextStep0 = prenomOk;

  const onPrenomChange = useCallback((v: string) => { setPrenom(sanitizeName(v)); setError(''); }, [setError]);
  const onNomChange = useCallback((v: string) => { setNom(sanitizeName(v)); setError(''); }, [setError]);
  const onPwChange = useCallback((v: string) => { setPasswordValue(v); setError(''); }, [setError]);
  const toggleShowPw = useCallback(() => setShowPw(v => !v), []);
  const toggleTerms = useCallback(() => { setTermsAccepted((v) => !v); setError(''); }, [setError]);

  // skipPassword: the "Later" link of the optional password step.
  const handleSubmit = useCallback(async (skipPassword = false) => {
    if (submittingRef.current) return;
    if (!canNextStep0) { setError(t('completeProfile.nameError')); return; }
    const withPassword = showPasswordStep && !skipPassword;
    if (withPassword && !isValidPw) { setError(t('setPassword.validationError')); return; }
    if (!termsAccepted) { setError(t('register.termsRequired')); return; }
    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    const pw = withPassword ? password : undefined;
    const result = await completeProfile(prenomTrimmed, nomTrimmed, termsAccepted, undefined, undefined, pw);
    submittingRef.current = false;
    setIsLoading(false);
    if (result.success) {
      // A storage failure only loses the badge: the account is created, go home anyway.
      await AsyncStorage.setItem(SHOW_GUID_BADGE_KEY, '1').catch(() => {});
      await flagHomeWelcome('new');
      goHomeAfterLogin(router);
    } else {
      if (result.isNetworkError) {
        Alert.alert(t('common.networkError'), result.error);
      } else {
        setError(result.error || t('common.genericError'));
      }
    }
  }, [prenomTrimmed, nomTrimmed, canNextStep0, showPasswordStep, isValidPw, password, termsAccepted, completeProfile, setError, t]);

  const goNext = useCallback(() => {
    if (step === 0 && canNextStep0 && !nameTrackedRef.current) {
      nameTrackedRef.current = true;
      api.trackSignup('name_done', showPasswordStep ? 'email' : 'social');
    }
    if (isLastStep) { void handleSubmit(); return; }
    if (!canNextStep0) { setError(t('completeProfile.nameError')); return; }
    animateStep(step + 1);
  }, [isLastStep, handleSubmit, step, canNextStep0, showPasswordStep, animateStep, setError, t]);

  const skipPassword = useCallback(() => { void handleSubmit(true); }, [handleSubmit]);

  const goBack = useCallback(() => {
    if (step > 0) {
      animateStep(step - 1);
    }
  }, [step, animateStep]);

  // Android Back: previous step, and never back to verify-otp / login for a
  // signed-in user with an unfinished profile (asks before leaving the app).
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) goBack();
      else {
        Alert.alert(t('completeProfile.leaveTitle'), t('completeProfile.leaveMessage'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('completeProfile.leaveConfirm'), style: 'destructive', onPress: () => BackHandler.exitApp() },
        ]);
      }
      return true;
    });
    return () => sub.remove();
  }, [step, goBack, t]));

  // Wrong address typed at sign-up: the only way out of this screen.
  const confirmChangeAccount = useCallback(() => {
    Alert.alert(t('completeProfile.changeAccount'), t('completeProfile.changeAccountConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.ok'), onPress: () => { void logout(); } },
    ]);
  }, [logout, t]);

  const stepTitles = useMemo(() => [
    t('completeProfile.step1Title'),
    t('completeProfile.step2Title'),
  ], [t]);

  const stepSubtitles = useMemo(() => [
    t('completeProfile.step1Subtitle'),
    t('completeProfile.step2Subtitle'),
  ], [t]);

  const StepIcon = STEP_ICONS[step];

  const canProceed = (step === 0 ? canNextStep0 : isValidPw) && (!isLastStep || termsAccepted);

  return (
    <View style={[s.root, { backgroundColor: theme.bg }]}>
      <LoginBackdrop dark={theme.mode === 'dark'} />
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
                <View style={[s.stepIconCircle, { backgroundColor: palette.violet }]}>
                  <StepIcon size={ICON_20} color="#fff" strokeWidth={2} />
                </View>
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
                  password={password} isValidPw={isValidPw}
                  showPw={showPw} strength={strength}
                  onPwChange={onPwChange} onToggleShowPw={toggleShowPw}
                  onNext={goNext} onSkip={skipPassword}
                />
              )}

              {/* Social sign-ups and resumed sign-ups reach this screen without a fresh consent */}
              {isLastStep && !signupTermsAccepted && (
                <TermsCheckbox theme={theme} t={t} checked={termsAccepted} onToggle={toggleTerms} />
              )}

              <FormError message={error} />
            </Animated.View>

            {step === 0 && (
              <TouchableOpacity
                onPress={confirmChangeAccount}
                style={{ alignSelf: 'center', padding: hp(12) }}
                accessibilityRole="button"
              >
                <Text style={{ color: theme.textMuted, fontSize: fontSize.sm }}>{t('completeProfile.changeAccount')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <BottomActionBar
            theme={theme} t={t}
            step={step}
            isLoading={isLoading}
            canProceed={canProceed}
            isLast={isLastStep}
            onBack={goBack}
            onPrimary={goNext}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
