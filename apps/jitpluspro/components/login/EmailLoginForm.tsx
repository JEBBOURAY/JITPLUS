import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Eye, EyeOff, Mail, ArrowRight, WifiOff, TriangleAlert } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { JitLock } from '@/components/icons';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { hapticError } from '@/utils/haptics';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { font, icon, shadow } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import FadeSlideIn from '@jitplus/shared/src/login/FadeSlideIn';
import type { EmailLogin } from '@/components/login/useEmailLogin';

const AMBER_TEXT = '#92400E';
const AMBER_TEXT_DARK = '#FCD34D';

type Field = 'email' | 'password';

/**
 * Email + password form of the login screen: offline and cool-down banners,
 * the two fields (they shake once on wrong credentials), the inline error,
 * "forgot password" and the submit button.
 */
export function EmailLoginForm({ login, emailRef, passwordRef, reduceMotion, onForgotPassword }: {
  login: EmailLogin;
  emailRef: RefObject<TextInput | null>;
  passwordRef: RefObject<TextInput | null>;
  reduceMotion: boolean | null;
  onForgotPassword: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const dark = theme.mode === 'dark';
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<Field | null>(null);
  const [shakeAnim] = useState(() => new Animated.Value(0));

  const { loginError, isLoading } = login;
  const hasCredentialError = loginError.type === 'credentials';
  const showInlineError = loginError.type !== 'none' && !!loginError.message;
  const submitIdle = login.submitDisabled && !isLoading;
  const amber = dark ? AMBER_TEXT_DARK : AMBER_TEXT;

  // Built once: recreating the interpolation on each keystroke would re-attach its native node.
  const shakeStyle = useMemo(() => ({
    transform: [{
      translateX: shakeAnim.interpolate({
        inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
        outputRange: [0, -8, 7, -5, 4, -2, 0],
      }),
    }],
  }), [shakeAnim]);

  // Wrong credentials: the fields shake once, with an error buzz.
  useEffect(() => {
    if (loginError.type !== 'credentials') return;
    hapticError();
    if (reduceMotion) return;
    shakeAnim.setValue(0);
    const anim = Animated.timing(shakeAnim, { toValue: 1, duration: 380, easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [loginError.type, reduceMotion, shakeAnim]);

  const fieldStyle = (field: Field) => {
    const isFocused = focusedField === field;
    return [
      styles.inputWrapper,
      {
        flexDirection: dir.row,
        backgroundColor: theme.inputBg,
        borderColor: hasCredentialError ? theme.danger : isFocused ? palette.violet : theme.inputBorder,
      },
      hasCredentialError && styles.inputError,
    ];
  };
  const inputStyle = [styles.inputField, { color: theme.text, textAlign: dir.textAlign }, dir.isRTL && styles.inputFieldRtl];
  const blur = (field: Field) => () => setFocusedField((f) => (f === field ? null : f));

  return (
    <>
      {!login.isOnline && (
        <FadeSlideIn>
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.banner, { flexDirection: dir.row, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          >
            <WifiOff size={ms(15)} color={theme.textSecondary} strokeWidth={icon.stroke} />
            <Text style={[styles.bannerText, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
              {t('login.offlineBanner')}
            </Text>
          </View>
        </FadeSlideIn>
      )}

      {login.isRateLimited && (
        <FadeSlideIn>
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.banner, styles.rateLimitBanner, { flexDirection: dir.row }]}
          >
            <TriangleAlert size={ms(15)} color={amber} strokeWidth={icon.stroke} />
            <Text style={[styles.bannerText, { color: amber, textAlign: dir.textAlign }]}>
              {t('login.rateLimitedBanner', { minutes: login.rateRemainingMin })}
            </Text>
          </View>
        </FadeSlideIn>
      )}

      <Animated.View style={shakeStyle}>
        <View style={styles.inputContainer}>
          <View style={fieldStyle('email')}>
            <Mail size={ms(17)} color={palette.violet} strokeWidth={icon.stroke} />
            <TextInput
              ref={emailRef}
              style={inputStyle}
              placeholder={t('login.emailPlaceholder')}
              placeholderTextColor={theme.inputPlaceholder}
              value={login.email}
              onChangeText={login.changeEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!isLoading}
              onFocus={() => setFocusedField('email')}
              onBlur={blur('email')}
            />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <View style={fieldStyle('password')}>
            <JitLock size={ms(17)} color={palette.violet} strokeWidth={icon.stroke} />
            <TextInput
              ref={passwordRef}
              style={inputStyle}
              placeholder={t('login.passwordPlaceholder')}
              placeholderTextColor={theme.inputPlaceholder}
              value={login.password}
              onChangeText={login.changePassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={login.submit}
              editable={!isLoading}
              onFocus={() => setFocusedField('password')}
              onBlur={blur('password')}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((p) => !p)}
              activeOpacity={0.75}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('login.passwordVisibleA11y') : t('login.passwordHiddenA11y')}
              style={styles.eyeTap}
            >
              {showPassword ? (
                <EyeOff size={ms(19)} color={theme.inputPlaceholder} strokeWidth={icon.stroke} />
              ) : (
                <Eye size={ms(19)} color={theme.inputPlaceholder} strokeWidth={icon.stroke} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {showInlineError && (
        <FadeSlideIn>
          <View
            style={[styles.fieldErrorRow, { flexDirection: dir.row }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <TriangleAlert size={ms(13)} color={theme.danger} strokeWidth={icon.strokeSmall} />
            <Text style={[styles.fieldErrorText, { color: theme.danger, textAlign: dir.textAlign }]}>{loginError.message}</Text>
          </View>
        </FadeSlideIn>
      )}

      <TouchableOpacity activeOpacity={0.7} onPress={onForgotPassword} accessibilityRole="button">
        <Text style={[styles.forgotText, { color: palette.violet, textAlign: dir.isRTL ? 'left' : 'right' }]}>
          {t('login.forgotPassword')}
        </Text>
      </TouchableOpacity>

      <ActionButton
        label={t('login.loginBtn')}
        accessibilityLabel={isLoading ? t('login.connecting') : t('login.loginBtn')}
        onPress={login.submit}
        disabled={login.submitDisabled}
        loading={isLoading}
        size="lg"
        icon={ArrowRight}
        iconPosition="end"
        flipIconInRTL
        iconColor={submitIdle ? theme.textMuted : undefined}
        style={[styles.button, submitIdle ? { backgroundColor: theme.inputBg, borderColor: theme.inputBorder } : styles.buttonActiveShadow]}
        labelStyle={submitIdle ? [styles.buttonIdleText, { color: theme.textMuted }] : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: ms(44),
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: wp(12),
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(12),
  },
  rateLimitBanner: {
    borderColor: 'rgba(245,158,11,0.25)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  bannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },

  inputContainer: { marginBottom: hp(12) },
  inputWrapper: {
    minHeight: ms(52),
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: wp(14),
    alignItems: 'center',
    gap: wp(10),
  },
  inputError: {
    backgroundColor: 'rgba(239,68,68,0.04)',
  },
  inputField: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font.medium,
  },
  inputFieldRtl: {
    marginRight: wp(2),
  },
  eyeTap: {
    minWidth: ms(24),
    minHeight: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
  },

  fieldErrorRow: {
    alignItems: 'center',
    gap: wp(6),
    marginTop: hp(2),
    marginBottom: hp(10),
    paddingHorizontal: wp(2),
  },
  fieldErrorText: {
    flex: 1,
    fontSize: ms(12),
    fontFamily: font.medium,
  },

  forgotText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
    marginBottom: hp(14),
  },

  button: {
    marginTop: hp(4),
    // Overrides ActionButton's 0.55 disabled fade: the idle look is the grey fill instead.
    opacity: 1,
  },
  buttonActiveShadow: {
    borderWidth: 0,
    ...shadow.sm,
  },
  buttonIdleText: { opacity: 0.8 },
});
