import type { RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Check, LogIn, Mail } from 'lucide-react-native';
import { AppleLogo } from '@/components/AppleLogo';
import { GoogleLogo } from '@/components/GoogleLogo';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import type { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import type { useAppleIdToken } from '@/hooks/useAppleIdToken';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { StepPassword, type PasswordField } from './StepPassword';
import { FieldError } from './FieldError';
import { formStyles, HIT_SLOP } from './formStyles';

export type AccountField = 'email' | PasswordField;

interface Props {
  google: ReturnType<typeof useGoogleIdToken>;
  apple: ReturnType<typeof useAppleIdToken>;
  /** Set once Google or Apple gave an account: the e-mail form is not needed. */
  socialProvider: 'google' | 'apple' | null;
  onResetSocial: () => void;

  email: string;
  onEmailChange: (value: string) => void;
  onEmailBlur: () => void;
  emailValid: boolean;
  emailChecking: boolean;
  emailTaken: boolean;
  showEmailInvalid: boolean;
  showEmailRequired: boolean;
  onLoginWithEmail: () => void;

  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;

  emailRef: RefObject<TextInput | null>;
  passwordRef: RefObject<TextInput | null>;
  confirmRef: RefObject<TextInput | null>;
  isLoading: boolean;
  submitAttempted: boolean;
  onFieldLayout: (field: AccountField, e: LayoutChangeEvent) => void;
  onSubmit: () => void;
}

/** Step 1: Google / Apple, or e-mail + password. */
export function AccountStep({
  google, apple, socialProvider, onResetSocial, email, onEmailChange, onEmailBlur, emailValid, emailChecking, emailTaken, showEmailInvalid, showEmailRequired, onLoginWithEmail, password, setPassword, confirmPassword, setConfirmPassword, showPassword, setShowPassword, emailRef, passwordRef, confirmRef, isLoading, submitAttempted, onFieldLayout, onSubmit,
}: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();

  if (socialProvider) {
    return (
      <View style={[styles.linkedCard, { flexDirection: dir.row, backgroundColor: `${theme.success}10`, borderColor: `${theme.success}30` }]}>
        <View style={styles.linkedAvatar}>
          {socialProvider === 'apple' ? <AppleLogo size={ms(18)} color="#fff" /> : <GoogleLogo size={ms(18)} />}
        </View>
        <View style={formStyles.flex1}>
          <Text style={[styles.linkedTitle, { color: theme.text, textAlign: dir.textAlign }]}>
            {socialProvider === 'apple' ? t('registerExtra.appleLinked') : t('registerExtra.googleLinked')}
          </Text>
          <Text style={[styles.linkedSub, { color: theme.success, textAlign: dir.textAlign }]}>
            {t('registerExtra.noEmailVerifNeeded')}
          </Text>
        </View>
        <Check size={ms(16)} color={theme.success} strokeWidth={icon.stroke} />
        <TouchableOpacity
          onPress={onResetSocial}
          activeOpacity={0.7}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
        >
          <Text style={[styles.linkedReset, { color: theme.textMuted }]}>
            {socialProvider === 'apple' ? t('registerExtra.appleChange') : t('registerExtra.googleChange')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const emailBorder =
    emailValid && !emailTaken ? palette.charbon
      : showEmailInvalid || showEmailRequired || emailTaken ? theme.danger
        : theme.border;

  return (
    <>
      <TouchableOpacity
        style={[styles.socialBtn, { flexDirection: dir.row, backgroundColor: theme.bgCard, borderColor: theme.border }]}
        onPress={google.promptGoogle}
        disabled={google.isLoading || isLoading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('registerExtra.signUpWithGoogle')}
      >
        {google.isLoading ? (
          <ActivityIndicator color={palette.charbon} size="small" />
        ) : (
          <>
            <GoogleLogo size={ms(20)} />
            <Text style={[styles.socialBtnText, { color: theme.text }]}>{t('registerExtra.signUpWithGoogle')}</Text>
          </>
        )}
      </TouchableOpacity>
      {!!google.error && <FieldError>{google.error}</FieldError>}

      {apple.isAvailable && (
        <TouchableOpacity
          style={[styles.socialBtn, styles.appleBtn, { flexDirection: dir.row }]}
          onPress={apple.promptApple}
          disabled={apple.isLoading || isLoading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('registerExtra.signUpWithApple')}
        >
          {apple.isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <AppleLogo size={ms(20)} color="#fff" />
              <Text style={[styles.socialBtnText, styles.appleBtnText]}>{t('registerExtra.signUpWithApple')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {!!apple.error && <FieldError>{apple.error}</FieldError>}

      <View style={styles.separator}>
        <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
        <Text style={[styles.separatorText, { color: theme.textMuted }]}>{t('login.orDivider')}</Text>
        <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
      </View>

      <View style={formStyles.field} onLayout={(e) => onFieldLayout('email', e)}>
        <Text style={[formStyles.label, { color: theme.text, textAlign: dir.textAlign }]}>{t('register.emailLabel')} *</Text>
        <View
          style={[
            formStyles.inputRow,
            {
              flexDirection: dir.row,
              backgroundColor: theme.bgInput,
              borderColor: emailBorder,
              borderWidth: emailValid || showEmailInvalid || showEmailRequired ? 2 : 1.5,
            },
          ]}
        >
          <Mail size={ms(18)} color={emailValid ? palette.charbon : theme.textMuted} strokeWidth={icon.stroke} />
          <TextInput
            ref={emailRef}
            style={[formStyles.input, { color: theme.text, textAlign: dir.textAlign }]}
            value={email}
            onChangeText={onEmailChange}
            onBlur={onEmailBlur}
            placeholder={t('register.emailPlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            editable={!isLoading}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          {emailChecking ? (
            <ActivityIndicator size="small" color={palette.charbon} />
          ) : (
            emailValid && !emailTaken && <Check size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />
          )}
        </View>
        {showEmailInvalid && <FieldError>{t('login.invalidEmail')}</FieldError>}
        {showEmailRequired && <FieldError>{t('registerExtra.emailRequired')}</FieldError>}
        {emailTaken && (
          <View style={[styles.takenBox, { backgroundColor: `${theme.danger}0D`, borderColor: `${theme.danger}30` }]}>
            <Text style={[formStyles.takenText, { color: theme.danger, textAlign: dir.textAlign }]}>{t('registerExtra.emailAlreadyUsed')}</Text>
            <TouchableOpacity
              onPress={onLoginWithEmail}
              style={[styles.takenCta, { flexDirection: dir.row, backgroundColor: palette.charbon }]}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <LogIn size={ms(14)} color="#fff" strokeWidth={icon.stroke} style={dir.flip} />
              <Text style={styles.takenCtaText}>{t('registerExtra.loginWithEmail')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <StepPassword
        theme={theme}
        t={t}
        password={password}
        setPassword={setPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        passwordRef={passwordRef}
        confirmRef={confirmRef}
        isLoading={isLoading}
        submitAttempted={submitAttempted}
        onFieldLayout={onFieldLayout}
        onSubmit={onSubmit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  socialBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radius.md,
    minHeight: 48,
    height: hp(50),
    gap: wp(10),
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  appleBtn: { backgroundColor: '#000', borderColor: '#000', marginTop: hp(8) },
  appleBtnText: { color: '#fff' },
  socialBtnText: { fontSize: fontSize.md, fontFamily: font.semibold },
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: hp(14) },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separatorText: { marginHorizontal: wp(14), fontSize: fontSize.xs, fontFamily: font.semibold },
  linkedCard: { alignItems: 'center', gap: wp(10), padding: wp(12), borderRadius: radius.lg, borderWidth: 1.5, marginBottom: hp(18) },
  linkedAvatar: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(18),
    backgroundColor: palette.charbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedTitle: { fontSize: fontSize.sm, fontFamily: font.semibold },
  linkedSub: { fontSize: fontSize.xs, fontFamily: font.medium, marginTop: 2 },
  linkedReset: { fontSize: fontSize.xs, fontFamily: font.semibold, textDecorationLine: 'underline' },
  takenBox: { marginTop: hp(8), padding: wp(12), borderRadius: radius.md, borderWidth: 1, gap: hp(10) },
  takenCta: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: wp(6),
    paddingHorizontal: wp(12),
    paddingVertical: hp(8),
    borderRadius: radius.md,
  },
  takenCtaText: { color: '#fff', fontSize: fontSize.sm, fontFamily: font.semibold },
});
