import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
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
  Animated,
  LayoutAnimation,
  Keyboard,
  BackHandler,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Check, LogIn, ShieldCheck } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import { isValidPassword } from '@/utils/passwordStrength';
import { isValidEmail } from '@/utils/validation';
import { getErrorMessage } from '@/utils/error';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import { parsePhone, phoneToSubmit } from '@/utils/parsePhone';
import { detectCountry } from '@/utils/detectCountry';
import { getErrorStatus, isNetworkError, isValidPhoneForCountry } from '@jitplus/shared';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import { useAppleIdToken } from '@/hooks/useAppleIdToken';
import { useHapticWhenValid } from '@/hooks/useHapticWhenValid';
import { useRegisterDraft, type RegisterDraft } from '@/hooks/useRegisterDraft';
import { useReferralCode, referralCodeFromLink } from '@/hooks/useReferralCode';
import { useStoreLocation } from '@/hooks/useStoreLocation';
import { useDir } from '@/hooks/useDir';
import { ActionButton } from '@/components/ui/ActionButton';
import { AccountStep, type AccountField } from '@/components/register/AccountStep';
import { StoreStep, type StoreField } from '@/components/register/StoreStep';
import { RegisterHeader, type RegisterStep } from '@/components/register/RegisterHeader';
import { CategoryPickerModal, LanguagePickerModal } from '@/components/register/PickerModals';
import { WelcomeOverlay } from '@/components/register/WelcomeOverlay';
import { formStyles } from '@/components/register/formStyles';
import type { MerchantCategory } from '@/types';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

type FormField = AccountField | StoreField;

/**
 * Merchant sign-up in two steps: 1 = the account (Google / Apple or e-mail +
 * password), 2 = the store. This screen holds the form state, validation and
 * submit; each step renders in its own component.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { googleRegister, appleRegister, register: authRegister, signIn } = useAuth();
  const { t, locale } = useLanguage();
  const dir = useDir();

  // ── Form state ──
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [appleIdentityToken, setAppleIdentityToken] = useState<string | null>(null);
  const [appleGivenName, setAppleGivenName] = useState<string | undefined>(undefined);
  const [appleFamilyName, setAppleFamilyName] = useState<string | undefined>(undefined);
  const [appleRawNonce, setAppleRawNonce] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [nomCommerce, setNomCommerce] = useState('');
  const [categorie, setCategorie] = useState<MerchantCategory | ''>('');
  // Dial code of the detected country; the merchant can pick another one.
  const [detectedCountry] = useState(detectCountry);
  const [phoneNumber, setPhoneNumber] = useState(detectedCountry.dial);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Invitation link (…/pro/register?ref=CODE): the sponsor's code is filled in.
  const { ref: refParam } = useLocalSearchParams<{ ref?: string }>();
  const [linkReferral] = useState(() => referralCodeFromLink(refParam));
  const referral = useReferralCode(linkReferral);
  const { code: referralCode, fill: fillReferral } = referral;
  const location = useStoreLocation();
  const { values: locationValues, restore: restoreLocation } = location;

  // ── Live checks and screen state ──
  const [emailTaken, setEmailTaken] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [phoneChecking, setPhoneChecking] = useState(false);
  // Errors stay hidden until the merchant leaves a field or taps the main button.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [step, setStep] = useState<RegisterStep>(1);
  const [continuing, setContinuing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  // Shown for a moment between "create account" and the dashboard.
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  const isSocialAuth = !!googleIdToken || !!appleIdentityToken;
  const socialProvider = googleIdToken ? 'google' : appleIdentityToken ? 'apple' : null;

  // ── Refs ──
  const submittingRef = useRef(false); // hard re-entrancy guard (double tap)
  const isMountedRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  // Field offsets inside the form body, to scroll to the first one left to fix.
  const bodyYRef = useRef(0);
  const fieldYRef = useRef<Partial<Record<FormField, number>>>({});
  // Latest values, written by the change handlers (never during render), read
  // when an on-blur check answers late.
  const latestEmailRef = useRef('');
  const latestPhoneRef = useRef('');
  // E-mail availability, shared by the on-blur check and "Continue" so the
  // address is checked once (the endpoint allows 10 calls per minute).
  const emailCheckRef = useRef<{ email: string; result: Promise<boolean | null> } | null>(null);
  // Set while a draft is being restored: restored fields must not buzz as "just validated".
  const hapticsMutedRef = useRef(false);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  // ── Steps ──
  const goToStep = useCallback((next: RegisterStep) => {
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // Each step starts clean: errors from the other step must not show here.
    setSubmitAttempted(false);
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  // Google / Apple already gave us the account: go straight to the store step.
  const handleGoogleToken = useCallback((idToken: string) => {
    setGoogleIdToken(idToken);
    setAppleIdentityToken(null);
    goToStep(2);
  }, [goToStep]);
  const google = useGoogleIdToken(handleGoogleToken);

  const handleAppleToken = useCallback(
    (data: { identityToken: string; givenName?: string; familyName?: string; rawNonce: string }) => {
      setAppleIdentityToken(data.identityToken);
      if (data.givenName !== undefined) setAppleGivenName(data.givenName);
      if (data.familyName !== undefined) setAppleFamilyName(data.familyName);
      setAppleRawNonce(data.rawNonce);
      setGoogleIdToken(null);
      goToStep(2);
    },
    [goToStep],
  );
  const apple = useAppleIdToken(handleAppleToken);

  const resetSocial = useCallback(() => {
    setGoogleIdToken(null);
    setAppleIdentityToken(null);
    setAppleGivenName(undefined);
    setAppleFamilyName(undefined);
    setAppleRawNonce(null);
  }, []);

  // ── Entrance animation ──
  const [headerAnim] = useState(() => new Animated.Value(0));
  const [cardAnim] = useState(() => new Animated.Value(0));
  const [footerAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.stagger(120, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
      Animated.timing(footerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [headerAnim, cardAnim, footerAnim]);

  // ── Field changes ──
  const handleEmailChange = useCallback((value: string) => {
    latestEmailRef.current = value.trim().toLowerCase();
    setEmail(value);
    setEmailTaken(false);
  }, []);

  const handlePhoneChange = useCallback((value: string) => {
    latestPhoneRef.current = phoneToSubmit(value);
    setPhoneNumber(value);
    setPhoneTaken(false);
  }, []);

  // The number as sent to the server; '' while only the dial code is there.
  const normalizedPhone = phoneToSubmit(phoneNumber);

  // ── Draft: a merchant who leaves halfway finds the form as they left it ──
  const draft = useMemo<RegisterDraft>(() => ({
    email: email.trim(),
    nomCommerce,
    // A lone dial code is not saved: it must not replace the detected country.
    phoneNumber: normalizedPhone,
    categorie,
    ...locationValues,
    referralCode: referralCode.trim(),
  }), [email, nomCommerce, normalizedPhone, categorie, locationValues, referralCode]);

  const restoreDraft = useCallback((d: RegisterDraft) => {
    // The restored values render after this call; keep haptics quiet until then.
    hapticsMutedRef.current = true;
    setTimeout(() => { hapticsMutedRef.current = false; }, 400);
    if (d.email) handleEmailChange(d.email);
    if (d.nomCommerce) setNomCommerce(d.nomCommerce);
    if (d.phoneNumber) handlePhoneChange(d.phoneNumber);
    if (d.categorie) setCategorie(d.categorie as MerchantCategory);
    restoreLocation(d);
    // A code from an invitation link wins over the one in the draft.
    if (d.referralCode && !linkReferral) fillReferral(d.referralCode);
  }, [handleEmailChange, handlePhoneChange, restoreLocation, linkReferral, fillReferral]);

  const { clear: clearDraft } = useRegisterDraft(draft, restoreDraft);

  // ── Validation ──
  const parsedPhone = useMemo(() => parsePhone(phoneNumber, detectedCountry.code), [phoneNumber, detectedCountry.code]);
  const phoneValid = isValidPhoneForCountry(parsedPhone.localPart, parsedPhone.country);
  const storeNameValid = nomCommerce.trim().length > 0;
  const emailValid = isValidEmail(email);
  // The address as sent to the server (checks, sign-up, login prefill).
  const normalizedEmail = email.trim().toLowerCase();
  const passwordValid = isValidPassword(password);
  const passwordOk = passwordValid && password === confirmPassword;

  // Same order as on screen, so the merchant is sent to the topmost problem.
  const firstInvalidAccountField = useMemo((): FormField | null => {
    if (isSocialAuth) return null;
    if (!emailValid || emailTaken) return 'email';
    if (!passwordValid) return 'password';
    if (password !== confirmPassword) return 'confirm';
    return null;
  }, [isSocialAuth, emailValid, emailTaken, passwordValid, password, confirmPassword]);

  const firstInvalidStoreField = useMemo((): FormField | null => {
    if (!storeNameValid) return 'name';
    if (!phoneValid || phoneTaken) return 'phone';
    if (!termsAccepted) return 'terms';
    return null;
  }, [storeNameValid, phoneValid, phoneTaken, termsAccepted]);

  const canSubmit = !firstInvalidAccountField && !firstInvalidStoreField;

  // A light tap when a field turns valid: the merchant feels the progress.
  useHapticWhenValid(phoneValid, hapticsMutedRef);
  useHapticWhenValid(passwordValid, hapticsMutedRef);
  useHapticWhenValid(passwordOk, hapticsMutedRef);

  const showNameError = submitAttempted && !storeNameValid;
  const showPhoneRequired = submitAttempted && !parsedPhone.localPart;
  const showEmailRequired = submitAttempted && !email.trim();
  const showEmailInvalid = (emailBlurred || submitAttempted) && !!email.trim() && !emailValid;
  const showTermsError = submitAttempted && !termsAccepted;

  const handleFieldLayout = useCallback((field: FormField, e: LayoutChangeEvent) => {
    fieldYRef.current[field] = e.nativeEvent.layout.y;
  }, []);

  /** Shows every missing piece and brings the first one into view. */
  const revealMissing = useCallback((field: FormField | null) => {
    setSubmitAttempted(true);
    hapticError();
    if (!field) return;
    const y = bodyYRef.current + (fieldYRef.current[field] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - hp(16)), animated: true });
    const input = { name: nameRef, phone: phoneRef, email: emailRef, password: passwordRef, confirm: confirmRef, terms: null }[field];
    if (input) setTimeout(() => input.current?.focus(), 350);
    else Keyboard.dismiss();
  }, []);

  // ── Server checks ──
  /**
   * true / false once the server answered, null if it could not (network,
   * rate limit). Concurrent and repeated calls for one address share a single
   * request; a failed one is retried on the next call.
   */
  const checkEmailTaken = useCallback((address: string): Promise<boolean | null> => {
    const current = emailCheckRef.current;
    if (current && current.email === address) return current.result;
    const result = api
      .post('/auth/check-email', { email: address })
      .then(({ data }) => !!data?.exists)
      .catch(() => {
        if (emailCheckRef.current?.email === address) emailCheckRef.current = null;
        return null;
      });
    emailCheckRef.current = { email: address, result };
    return result;
  }, []);

  const handleEmailBlur = useCallback(async () => {
    setEmailBlurred(true);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) return;
    setEmailChecking(true);
    const taken = await checkEmailTaken(normalizedEmail);
    if (!isMountedRef.current) return;
    setEmailChecking(false);
    // Ignore a late answer for an address the merchant has since changed.
    if (taken !== null && latestEmailRef.current === normalizedEmail) setEmailTaken(taken);
  }, [normalizedEmail, checkEmailTaken]);

  /** Same contract as checkEmailTaken: null when the server could not answer. */
  const checkPhoneTaken = useCallback((phone: string): Promise<boolean | null> =>
    api
      .post('/auth/check-phone', { phoneNumber: phone })
      .then(({ data }) => !!data?.exists)
      .catch(() => null), []);

  const handlePhoneBlur = useCallback(async () => {
    if (!phoneValid) return;
    setPhoneChecking(true);
    const taken = await checkPhoneTaken(normalizedPhone);
    if (!isMountedRef.current) return;
    setPhoneChecking(false);
    // No answer: silent, the server checks again on submit.
    if (taken !== null && latestPhoneRef.current === normalizedPhone) setPhoneTaken(taken);
  }, [normalizedPhone, phoneValid, checkPhoneTaken]);

  // ── Actions ──
  const handleContinue = useCallback(async () => {
    if (isSocialAuth) {
      goToStep(2);
      return;
    }
    if (firstInvalidAccountField) {
      revealMissing(firstInvalidAccountField);
      return;
    }
    // Make sure the address is free before leaving the step. Reuses the on-blur
    // check when it already ran (or is still running) for this address.
    setContinuing(true);
    const taken = await checkEmailTaken(normalizedEmail);
    if (!isMountedRef.current) return;
    setContinuing(false);
    if (taken) {
      setEmailTaken(true);
      revealMissing('email');
      return;
    }
    // taken === null (no answer): go on, a duplicate is caught on submit and
    // brings the merchant back here (see showSignupConflict).
    hapticSuccess();
    goToStep(2);
  }, [isSocialAuth, firstInvalidAccountField, revealMissing, normalizedEmail, checkEmailTaken, goToStep]);

  // "Done" key of the last password field. handleContinue changes with every
  // e-mail keystroke; passing it directly would re-render the memoized
  // password block each time. This wrapper never changes and calls the latest one.
  const continueRef = useRef(handleContinue);
  useEffect(() => { continueRef.current = handleContinue; }, [handleContinue]);
  const continueFromKeyboard = useCallback(() => { void continueRef.current(); }, []);

  // Lands on the login screen with the address ready, instead of a dead end.
  const goToLogin = useCallback((prefillEmail?: string) => {
    router.dismissTo(prefillEmail ? { pathname: '/login', params: { email: prefillEmail } } : '/login');
  }, [router]);

  /** Account created and signed in: celebrate briefly, then open the dashboard. */
  const finishSignup = useCallback(() => {
    clearDraft();
    Keyboard.dismiss();
    setWelcomeName(nomCommerce.trim());
  }, [clearDraft, nomCommerce]);

  /** Finds which field caused a sign-up conflict (409) and sends the merchant to it. */
  const showSignupConflict = useCallback(async (): Promise<boolean> => {
    emailCheckRef.current = null; // the cached answer was wrong: ask again
    const [emailTakenNow, phoneTakenNow] = await Promise.all([
      isSocialAuth ? Promise.resolve(null) : checkEmailTaken(normalizedEmail),
      checkPhoneTaken(normalizedPhone),
    ]);
    if (!isMountedRef.current) return true;
    if (emailTakenNow) {
      setEmailTaken(true);
      goToStep(1);
      setTimeout(() => revealMissing('email'), 50);
      return true;
    }
    if (phoneTakenNow) {
      setPhoneTaken(true);
      revealMissing('phone');
      return true;
    }
    return false;
  }, [isSocialAuth, checkEmailTaken, checkPhoneTaken, normalizedEmail, normalizedPhone, goToStep, revealMissing]);

  const handleRegister = useCallback(async () => {
    if (submittingRef.current) return;
    if (!canSubmit) {
      if (firstInvalidAccountField) {
        goToStep(1);
        setTimeout(() => revealMissing(firstInvalidAccountField), 50);
      } else {
        revealMissing(firstInvalidStoreField);
      }
      return;
    }
    Keyboard.dismiss();
    submittingRef.current = true;

    const { latitude, longitude, ville, quartier, adresse } = locationValues;
    const trimmedReferral = referralCode.trim();
    const storeData = {
      nomCommerce: nomCommerce.trim(),
      phoneNumber: normalizedPhone,
      ...(categorie && { categorie }),
      ...(ville.trim() && { ville: ville.trim() }),
      ...(quartier.trim() && { quartier: quartier.trim() }),
      ...(adresse.trim() && { adresse: adresse.trim() }),
      ...(latitude != null && longitude != null && { latitude, longitude }),
      ...(trimmedReferral && { referralCode: trimmedReferral }),
      // Saved on the account so e-mails and notifications use the same language.
      language: locale,
    };

    setIsLoading(true);
    try {
      const socialResult = googleIdToken
        ? await googleRegister(googleIdToken, { ...storeData, termsAccepted })
        : appleIdentityToken
          ? await appleRegister(appleIdentityToken, appleGivenName, appleFamilyName, { ...storeData, termsAccepted }, appleRawNonce ?? undefined)
          : null;
      if (socialResult) {
        if (socialResult.success) finishSignup();
        else Alert.alert(t('registerExtra.registrationError'), socialResult.error || t('registerExtra.registrationErrorMsg'));
        return;
      }

      // E-mail flow: create the account (pre-verified), then sign in.
      const { signedIn } = await authRegister({ email: normalizedEmail, password, ...storeData, termsAccepted });
      if (signedIn) {
        finishSignup();
        return;
      }
      // The account exists from here on. A later sign-in failure must NOT surface
      // as "registration failed" (a retry would hit a 409 on the now existing
      // e-mail). Retry the sign-in once, then fall back to the login screen.
      const creds = { email: normalizedEmail, password };
      try {
        await signIn(creds, true);
        finishSignup();
      } catch {
        try {
          await signIn(creds, true);
          finishSignup();
        } catch {
          Alert.alert(t('registerExtra.welcomeTitle'), t('registerExtra.welcomeMsg', { nom: nomCommerce.trim() }));
          clearDraft();
          router.replace('/login');
        }
      }
    } catch (error: unknown) {
      // 409: the e-mail or phone was taken after (or despite) the live checks.
      if (getErrorStatus(error) === 409 && (await showSignupConflict())) return;
      const isNetwork = isNetworkError(error);
      Alert.alert(
        isNetwork ? t('common.networkError') : t('registerExtra.registrationError'),
        isNetwork ? t('common.networkErrorMsg') : getErrorMessage(error, t('registerExtra.registrationErrorMsg')),
      );
    } finally {
      if (isMountedRef.current) setIsLoading(false);
      submittingRef.current = false;
    }
  }, [
    canSubmit, firstInvalidAccountField, firstInvalidStoreField, goToStep, revealMissing, showSignupConflict,
    locationValues, referralCode, nomCommerce, normalizedPhone, categorie, locale,
    googleIdToken, appleIdentityToken, appleGivenName, appleFamilyName, appleRawNonce,
    normalizedEmail, password, termsAccepted, googleRegister, appleRegister, authRegister, signIn,
    finishSignup, clearDraft, router, t,
  ]);

  // ── Back navigation ──
  // On the store step, "back" returns to the account step instead of leaving.
  const handleBack = useCallback(() => {
    if (step === 2) goToStep(1);
    else router.back();
  }, [step, goToStep, router]);

  const showingWelcome = welcomeName !== null;
  useEffect(() => {
    if (step !== 2 && !showingWelcome) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // The account exists: during the welcome there is nothing to go back to.
      if (!showingWelcome) goToStep(1);
      return true;
    });
    return () => sub.remove();
  }, [step, showingWelcome, goToStep]);

  return (
    <View style={[formStyles.flex1, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={formStyles.flex1} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={formStyles.flex1}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                opacity: headerAnim,
                transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
              }}
            >
              <RegisterHeader
                step={step}
                onBack={handleBack}
                onOpenLanguage={() => { Keyboard.dismiss(); setShowLangPicker(true); }}
                disabled={isLoading}
              />
            </Animated.View>

            <Animated.View
              onLayout={(e) => { bodyYRef.current = e.nativeEvent.layout.y; }}
              style={[
                styles.body,
                {
                  opacity: cardAnim,
                  transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
                },
              ]}
            >
              {step === 1 ? (
                <AccountStep
                  google={google}
                  apple={apple}
                  socialProvider={socialProvider}
                  onResetSocial={resetSocial}
                  email={email}
                  onEmailChange={handleEmailChange}
                  onEmailBlur={handleEmailBlur}
                  emailValid={emailValid}
                  emailChecking={emailChecking}
                  emailTaken={emailTaken}
                  showEmailInvalid={showEmailInvalid}
                  showEmailRequired={showEmailRequired}
                  onLoginWithEmail={() => goToLogin(normalizedEmail)}
                  password={password}
                  setPassword={setPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  emailRef={emailRef}
                  passwordRef={passwordRef}
                  confirmRef={confirmRef}
                  isLoading={isLoading}
                  submitAttempted={submitAttempted}
                  onFieldLayout={handleFieldLayout}
                  onSubmit={continueFromKeyboard}
                />
              ) : (
                <StoreStep
                  nomCommerce={nomCommerce}
                  onNameChange={setNomCommerce}
                  showNameError={showNameError}
                  categorie={categorie}
                  onOpenCategory={() => setShowCategoryPicker(true)}
                  phoneNumber={phoneNumber}
                  onPhoneChange={handlePhoneChange}
                  onPhoneBlur={handlePhoneBlur}
                  defaultCountry={detectedCountry.code}
                  phoneChecking={phoneChecking}
                  phoneTaken={phoneTaken}
                  showPhoneRequired={showPhoneRequired}
                  onLoginInstead={() => goToLogin()}
                  location={location}
                  referral={referral}
                  termsAccepted={termsAccepted}
                  onToggleTerms={() => setTermsAccepted((v) => !v)}
                  onOpenTerms={() => router.push('/legal')}
                  showTermsError={showTermsError}
                  nameRef={nameRef}
                  phoneRef={phoneRef}
                  isLoading={isLoading}
                  onFieldLayout={handleFieldLayout}
                />
              )}
            </Animated.View>

            <Animated.View style={[styles.actions, { opacity: footerAnim }]}>
              {isSocialAuth && step === 2 && (
                <View style={[styles.noVerifRow, { flexDirection: dir.row }]}>
                  <ShieldCheck size={ms(15)} color={theme.success} strokeWidth={icon.stroke} />
                  <Text style={[styles.noVerifText, { color: theme.textMuted }]}>{t('registerExtra.noEmailVerifNeeded')}</Text>
                </View>
              )}
              {/* Always tappable: when something is missing, it shows what and where. */}
              <ActionButton
                label={step === 1 ? t('registerExtra.continueBtn') : t('registerExtra.finishBtn')}
                onPress={step === 1 ? handleContinue : handleRegister}
                loading={step === 1 ? continuing : isLoading}
                size="lg"
                icon={step === 1 ? ArrowRight : Check}
                iconPosition="end"
                style={formStyles.primaryBtn}
              />
            </Animated.View>

            {step === 1 && (
              <Animated.View style={[styles.footer, { opacity: footerAnim }]}>
                <TouchableOpacity
                  onPress={() => router.push('/login')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  style={[styles.loginPrompt, { flexDirection: dir.row, backgroundColor: `${palette.charbon}06`, borderColor: `${palette.charbon}18` }]}
                >
                  <View style={[styles.loginIconWrap, { backgroundColor: palette.charbon }]}>
                    <LogIn size={ms(16)} color="#fff" strokeWidth={icon.stroke} style={dir.flip} />
                  </View>
                  <View style={formStyles.flex1}>
                    <Text style={[styles.loginPromptTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('register.alreadyAccount')}</Text>
                    <Text style={[styles.loginPromptSub, { color: palette.charbon, textAlign: dir.textAlign }]}>{t('register.loginLink')}</Text>
                  </View>
                  <ArrowRight size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} style={dir.flip} />
                </TouchableOpacity>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <CategoryPickerModal
        visible={showCategoryPicker}
        selected={categorie}
        onPick={(value) => { setCategorie(value); setShowCategoryPicker(false); }}
        onClose={() => setShowCategoryPicker(false)}
      />
      <LanguagePickerModal visible={showLangPicker} onClose={() => setShowLangPicker(false)} />

      {welcomeName !== null && (
        <WelcomeOverlay storeName={welcomeName} onDone={() => router.replace('/(tabs)')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingHorizontal: wp(20), paddingTop: hp(2), paddingBottom: hp(6) },
  body: { marginBottom: hp(2) },
  actions: { marginTop: hp(2), marginBottom: hp(4) },
  noVerifRow: { alignItems: 'center', justifyContent: 'center', gap: wp(6), marginBottom: hp(10) },
  noVerifText: { fontSize: fontSize.xs, fontFamily: font.medium },
  footer: { marginTop: hp(8), marginBottom: hp(12) },
  loginPrompt: {
    alignItems: 'center',
    paddingHorizontal: wp(14),
    paddingVertical: hp(14),
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: wp(10),
  },
  loginIconWrap: { width: ms(34), height: ms(34), borderRadius: ms(17), alignItems: 'center', justifyContent: 'center' },
  loginPromptTitle: { fontSize: fontSize.sm, marginBottom: 2, fontFamily: font.medium },
  loginPromptSub: { fontSize: fontSize.sm, fontFamily: font.bold },
});
