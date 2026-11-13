import React, { RefObject, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Eye, EyeOff, Check, Circle } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { getPasswordStrength, getPasswordRules, IOS_PASSWORD_RULES } from '@/utils/passwordStrength';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { palette } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import { FieldError } from './FieldError';
import { formStyles, HIT_SLOP } from './formStyles';

export type PasswordField = 'password' | 'confirm';

interface Props {
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  passwordRef: RefObject<TextInput | null>;
  confirmRef: RefObject<TextInput | null>;
  isLoading: boolean;
  /** The merchant tapped "create account": show what is still missing. */
  submitAttempted?: boolean;
  onFieldLayout?: (field: PasswordField, e: LayoutChangeEvent) => void;
  onSubmit?: () => void;
}

function StepPasswordInner({
  theme, t, password, setPassword, confirmPassword, setConfirmPassword,
  showPassword, setShowPassword, passwordRef, confirmRef, isLoading,
  submitAttempted = false, onFieldLayout, onSubmit,
}: Props) {
  const dir = useDir();
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  // Same rules as the backend (shared package): the checklist cannot drift from them.
  const pwRules = useMemo(() => getPasswordRules(password), [password]);
  const pwValid = pwRules.length && pwRules.upper && pwRules.digit && pwRules.special && pwRules.noSpace;
  const strength = useMemo(() => getPasswordStrength(password, t, 'passwordStrength.weak', 'passwordStrength.medium', 'passwordStrength.strong'), [password, t]);
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  // Wait until the merchant has typed as much as the password (or left the field)
  // instead of flagging a mismatch on the first character.
  const showMismatch =
    confirmPassword.length > 0 &&
    password !== confirmPassword &&
    (confirmTouched || submitAttempted || confirmPassword.length >= password.length);
  const showConfirmRequired = submitAttempted && confirmPassword.length === 0;
  const showPasswordError = submitAttempted && !pwValid;

  const rules = useMemo(() => [
    { key: 'length', ok: pwRules.length, label: t('registerExtra.passwordRuleLength', { count: MIN_PASSWORD_LENGTH }) },
    { key: 'upper', ok: pwRules.upper, label: t('registerExtra.passwordRuleUpper') },
    { key: 'digit', ok: pwRules.digit, label: t('registerExtra.passwordRuleDigit') },
    { key: 'special', ok: pwRules.special, label: t('registerExtra.passwordRuleSpecial') },
  ], [pwRules, t]);
  const hasSpace = !pwRules.noSpace;
  // The checklist stays out of the way until it is useful, and goes once all is green.
  const showRules = !pwValid && (passwordFocused || password.length > 0 || submitAttempted);

  return (
    <>
      <View style={formStyles.field} onLayout={(e) => onFieldLayout?.('password', e)}>
        <Text style={[formStyles.label, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('register.passwordLabel')} *
        </Text>
        <View
          style={[
            formStyles.inputRow,
            {
              flexDirection: dir.row,
              backgroundColor: theme.bgInput,
              borderColor:
                pwValid ? palette.charbon
                  : showPasswordError ? theme.danger
                  : theme.border,
              borderWidth: pwValid || showPasswordError ? 2 : 1.5,
            },
          ]}
        >
          <JitLock size={ms(18)} color={pwValid ? palette.charbon : theme.textMuted} strokeWidth={icon.stroke} />
          <TextInput
            ref={passwordRef}
            style={[formStyles.input, { color: theme.text, textAlign: dir.textAlign }]}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder={t('registerExtra.passwordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules={IOS_PASSWORD_RULES}
            editable={!isLoading}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t(showPassword ? 'registerExtra.hidePassword' : 'registerExtra.showPassword')}
          >
            {showPassword
              ? <EyeOff size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} />
              : <Eye size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} />}
          </TouchableOpacity>
          {pwValid && (
            <Check size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />
          )}
        </View>

        {showRules && (
          <View style={styles.rules}>
            {rules.map((rule) => {
              // Missing rules turn red only once the merchant tried to submit.
              const color = rule.ok ? theme.success : showPasswordError ? theme.danger : theme.textMuted;
              return (
                <View key={rule.key} style={[styles.ruleRow, { flexDirection: dir.row }]}>
                  {rule.ok
                    ? <Check size={ms(13)} color={color} strokeWidth={icon.strokeSmall} />
                    : <Circle size={ms(11)} color={color} strokeWidth={icon.strokeSmall} />}
                  <Text style={[styles.ruleText, { color, textAlign: dir.textAlign }]}>{rule.label}</Text>
                </View>
              );
            })}
            {hasSpace && (
              <Text style={[styles.ruleText, { color: theme.danger, textAlign: dir.textAlign }]}>
                {t('registerExtra.passwordRuleNoSpace')}
              </Text>
            )}
          </View>
        )}

        {pwValid && (
          <View style={styles.strengthWrap}>
            <View style={[styles.strengthTrack, { backgroundColor: theme.border }]}>
              <View
                style={[styles.strengthBar, {
                  width: `${strength.pct * 100}%`,
                  backgroundColor: strength.color,
                }]}
              />
            </View>
            <Text style={[formStyles.errorHint, styles.hintTight, { color: theme.success, textAlign: dir.textAlign }]}>
              {strength.label}
            </Text>
          </View>
        )}
      </View>

      <View style={formStyles.field} onLayout={(e) => onFieldLayout?.('confirm', e)}>
        <Text style={[formStyles.label, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('registerExtra.confirmPasswordLabel')} *
        </Text>
        <View
          style={[
            formStyles.inputRow,
            {
              flexDirection: dir.row,
              backgroundColor: theme.bgInput,
              borderColor:
                passwordsMatch ? palette.charbon
                  : showMismatch || showConfirmRequired ? theme.danger
                  : theme.border,
              borderWidth: passwordsMatch || showMismatch || showConfirmRequired ? 2 : 1.5,
            },
          ]}
        >
          <JitLock size={ms(18)} color={passwordsMatch ? palette.charbon : theme.textMuted} strokeWidth={icon.stroke} />
          <TextInput
            ref={confirmRef}
            style={[formStyles.input, { color: theme.text, textAlign: dir.textAlign }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onBlur={() => setConfirmTouched(true)}
            placeholder={t('registerExtra.confirmPasswordPlaceholder')}
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules={IOS_PASSWORD_RULES}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />
          {passwordsMatch && (
            <Check size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />
          )}
        </View>
        {showMismatch && (
          <FieldError>{t('registerExtra.passwordMismatch')}</FieldError>
        )}
        {showConfirmRequired && (
          <FieldError>{t('registerExtra.confirmRequired')}</FieldError>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hintTight: { marginTop: 4 },
  // Two columns: four rules take two lines instead of four.
  rules: { marginTop: hp(6), flexDirection: 'row', flexWrap: 'wrap', rowGap: hp(3) },
  ruleRow: { width: '50%', alignItems: 'center', gap: wp(6) },
  ruleText: { fontSize: fontSize.xs, lineHeight: ms(16), fontFamily: font.medium },
  strengthWrap: { marginTop: hp(6) },
  strengthTrack: { height: ms(4), borderRadius: ms(2), overflow: 'hidden' },
  strengthBar: { height: '100%', borderRadius: ms(2) },
});

export const StepPassword = React.memo(StepPasswordInner);
