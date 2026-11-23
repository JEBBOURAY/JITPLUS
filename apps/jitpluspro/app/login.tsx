import { useState, useRef, useEffect, useEffectEvent, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
  Easing,
  LayoutAnimation,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { isValidEmail } from '@/utils/validation';
import { Mail, ChevronDown } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';
import { useDir } from '@/hooks/useDir';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { font, icon } from '@/constants/design';
import { hapticLight } from '@/utils/haptics';
import LoginBackdrop from '@jitplus/shared/src/login/LoginBackdrop';
import LoginHeader from '@/components/login/LoginHeader';
import KhatamDivider from '@/components/login/KhatamDivider';
import PressScale from '@jitplus/shared/src/login/PressScale';
import { PRESS_SPRING } from '@/components/login/loginConstants';
import { useLoginIntro } from '@/components/login/useLoginIntro';
import { useEmailLogin } from '@/components/login/useEmailLogin';
import { EmailLoginForm } from '@/components/login/EmailLoginForm';
import { SocialSignIn } from '@/components/login/SocialSignIn';
import { LoginLanguageBar } from '@/components/login/LoginLanguageBar';

const EMAIL_ANIM_DURATION = 250;

/** Layout-only ease (no create/delete), so it never fights the Animated fades. */
const layoutEase = (duration: number) => ({
  duration,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
});

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const google = useGoogleAuth();
  const apple = useAppleAuth();
  const dir = useDir();
  // One sign-in at a time: email, Google and Apple lock each other out.
  const login = useEmailLogin(google.isLoading || apple.isLoading);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  // Sent by the register screen when the address already has an account.
  const { email: prefillEmail } = useLocalSearchParams<{ email?: string }>();
  // With the address already filled in, the password is what is left to type.
  const focusPasswordRef = useRef(false);

  const [formMounted, setFormMounted] = useState(false);
  const [emailFormAnim] = useState(() => new Animated.Value(0));
  const [compactAnim] = useState(() => new Animated.Value(0));

  const dark = theme.mode === 'dark';
  const reduceMotion = useReduceMotion();
  const { intro, introStarted } = useLoginIntro(reduceMotion);

  // Animated styles are built once: recreating interpolations on each render
  // (every keystroke) would detach and re-attach their native nodes.
  const anim = useMemo(() => ({
    items: intro.items.map((v) => ({
      opacity: v,
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    })),
    form: {
      opacity: emailFormAnim,
      transform: [{ translateY: emailFormAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
    },
    chevron: {
      transform: [{ rotate: emailFormAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
    },
  }), [intro, emailFormAnim]);

  const greetingKey = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'login.greetingMorning';
    if (h >= 18 || h < 5) return 'login.greetingEvening';
    return 'login.greetingDay';
  }, []);

  const openEmailForm = useCallback(() => {
    if (formMounted) return;

    // The crest shrinks and the content re-centres smoothly instead of jumping.
    if (!reduceMotion) LayoutAnimation.configureNext(layoutEase(EMAIL_ANIM_DURATION));
    setFormMounted(true);
    Animated.timing(compactAnim, {
      toValue: 1,
      duration: reduceMotion ? 0 : EMAIL_ANIM_DURATION,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
    requestAnimationFrame(() => {
      Animated.timing(emailFormAnim, {
        toValue: 1,
        duration: EMAIL_ANIM_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setTimeout(() => {
            (focusPasswordRef.current ? passwordRef : emailRef).current?.focus();
            focusPasswordRef.current = false;
          }, 10);
        }
      });
    });
  }, [formMounted, emailFormAnim, compactAnim, reduceMotion]);

  const closeEmailForm = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(emailFormAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (!reduceMotion) LayoutAnimation.configureNext(layoutEase(EMAIL_ANIM_DURATION));
      setFormMounted(false);
      Animated.timing(compactAnim, {
        toValue: 0,
        duration: reduceMotion ? 0 : EMAIL_ANIM_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, [emailFormAnim, compactAnim, reduceMotion]);

  // Arriving from register with a known address: fill it in and open the form.
  // An effect event, so it runs only when a new address arrives (not on every
  // form toggle) while still reading the current form state.
  const applyPrefill = useEffectEvent((address: string) => {
    login.prefill(address);
    focusPasswordRef.current = true;
    if (formMounted) passwordRef.current?.focus();
    else openEmailForm();
  });
  useEffect(() => {
    if (prefillEmail && isValidEmail(prefillEmail)) applyPrefill(prefillEmail);
  }, [prefillEmail]);

  const handleEmailDisclosure = useCallback(() => {
    if (formMounted) closeEmailForm();
    else openEmailForm();
  }, [formMounted, closeEmailForm, openEmailForm]);

  const goToRegister = useCallback(() => router.push('/register'), [router]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <LoginBackdrop dark={dark} />

      <LoginLanguageBar interactive={introStarted} />

      <SafeAreaView style={styles.container} edges={['bottom']} pointerEvents={introStarted ? 'auto' : 'none'}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <LoginHeader
              dark={dark}
              anims={intro}
              compact={compactAnim}
              isCompact={formMounted}
              greeting={t(greetingKey)}
              tagline={t('login.appTagline')}
              subtitle={t('login.valueProp')}
              taglineColor={theme.textMuted}
            />

            <View style={styles.formSection}>
              <SocialSignIn
                google={google}
                apple={apple}
                authBusy={login.authBusy}
                dark={dark}
                googleStyle={anim.items[0]}
                appleStyle={anim.items[1]}
                onRegister={goToRegister}
              />

              <Animated.View style={anim.items[2]}>
                <KhatamDivider
                  label={t('login.orDivider')}
                  lineColor={theme.inputBorder}
                  textColor={theme.textMuted}
                  dark={dark}
                  twinkle={intro.twinkle}
                />
              </Animated.View>

              <PressScale style={anim.items[3]} spring={PRESS_SPRING}>
                {(press) => (
              <TouchableOpacity
                {...press}
                onPress={() => { hapticLight(); handleEmailDisclosure(); }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ expanded: formMounted }}
                accessibilityLabel={t('login.continueWithEmail')}
                style={[styles.emailDisclosure, { flexDirection: dir.row, borderColor: palette.violet, backgroundColor: theme.bgCard }]}
              >
                <View style={styles.emailDisclosureIconWrap}>
                  <Mail size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />
                </View>
                <Text style={[styles.emailDisclosureText, { color: theme.text, textAlign: dir.textAlign }]}>
                  {t('login.continueWithEmail')}
                </Text>
                <Animated.View style={[styles.chevronWrap, anim.chevron]}>
                  <ChevronDown size={ms(18)} color={palette.violet} strokeWidth={icon.stroke} />
                </Animated.View>
              </TouchableOpacity>
                )}
              </PressScale>

              <Animated.View style={anim.items[4]}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={goToRegister}
                  style={styles.signupInlineWrap}
                  accessibilityRole="button"
                >
                  <Text style={styles.signupInlineText}>
                    <Text style={[styles.signupMuted, { color: theme.textMuted }]}>{t('login.noAccount')} </Text>
                    <Text style={[styles.signupLink, { color: palette.violet }]}>{t('login.createAccount')}</Text>
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {formMounted && (
              <Animated.View style={[styles.formSection, anim.form]}>
                <EmailLoginForm
                  login={login}
                  emailRef={emailRef}
                  passwordRef={passwordRef}
                  reduceMotion={reduceMotion}
                  onForgotPassword={() => router.push('/forgot-password')}
                />
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex1: { flex: 1 },
  container: { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(24),
    paddingVertical: hp(20),
  },

  formSection: { paddingHorizontal: wp(4) },

  emailDisclosure: {
    minHeight: ms(52),
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: wp(14),
    alignItems: 'center',
    gap: wp(10),
  },
  emailDisclosureIconWrap: {
    width: ms(24),
    height: ms(24),
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailDisclosureText: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  chevronWrap: {
    minWidth: ms(24),
    alignItems: 'center',
  },

  signupInlineWrap: {
    marginTop: hp(10),
    marginBottom: hp(16),
  },
  signupInlineText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    fontFamily: font.regular,
  },
  signupMuted: { fontFamily: font.regular },
  signupLink: { fontFamily: font.semibold },
});
