import React, { RefObject, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Lock, Eye, EyeOff, Check } from 'lucide-react-native';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { isValidPassword, getPasswordStrength } from '@/utils/passwordStrength';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

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
}

function StepPasswordInner({
  theme, t, password, setPassword, confirmPassword, setConfirmPassword,
  showPassword, setShowPassword, passwordRef, confirmRef, isLoading,
}: Props) {
  const pwValid = isValidPassword(password);
  const strength = useMemo(() => getPasswordStrength(password, t, 'passwordStrength.weak', 'passwordStrength.medium', 'passwordStrength.strong'), [password, t]);
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <>
      {/* Password */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>
          {t('register.passwordLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.bgInput,
              borderColor:
                password.length === 0 ? theme.border
                  : pwValid ? palette.charbon
                  : theme.danger,
              borderWidth: pwValid ? 2 : 1.5,
            },
          ]}
        >
          <Lock size={ms(18)} color={pwValid ? palette.charbon : theme.textMuted} />
          <TextInput
            ref={passwordRef}
            style={[styles.input, { color: theme.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder={t('registerExtra.passwordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            editable={!isLoading}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {showPassword ? <EyeOff size={ms(18)} color={theme.textMuted} /> : <Eye size={ms(18)} color={theme.textMuted} />}
          </TouchableOpacity>
          {pwValid && (
            <Check size={ms(16)} color={palette.charbon} style={{ marginLeft: wp(4) }} />
          )}
        </View>
        {/* Strength bar */}
        {password.length > 0 && (
          <View style={styles.strengthWrap}>
            <View style={[styles.strengthTrack, { backgroundColor: theme.border }]}>
              <View
                style={[styles.strengthBar, {
                  width: `${strength.pct * 100}%`,
                  backgroundColor: strength.color,
                }]}
              />
            </View>
            <Text
              style={[
                styles.hint,
                { color: pwValid ? theme.success : theme.danger, marginTop: 4 },
              ]}
            >
              {!pwValid
                ? t('registerExtra.passwordRequirements')
                : strength.label}
            </Text>
          </View>
        )}
      </View>

      {/* Confirm Password */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>
          {t('registerExtra.confirmPasswordLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.bgInput,
              borderColor:
                confirmPassword.length === 0 ? theme.border
                  : passwordsMatch ? palette.charbon
                  : theme.danger,
              borderWidth: passwordsMatch ? 2 : 1.5,
            },
          ]}
        >
          <Lock size={ms(18)} color={passwordsMatch ? palette.charbon : theme.textMuted} />
          <TextInput
            ref={confirmRef}
            style={[styles.input, { color: theme.text }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('registerExtra.confirmPasswordPlaceholder')}
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            editable={!isLoading}
            returnKeyType="done"
          />
          {passwordsMatch && (
            <Check size={ms(16)} color={palette.charbon} strokeWidth={2.5} />
          )}
        </View>
        {showMismatch && (
          <Text style={[styles.hint, { color: theme.danger }]}>
            {t('registerExtra.passwordMismatch')}
          </Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: hp(20) },
  label: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: hp(8), letterSpacing: 0.2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    height: hp(52),
    gap: wp(10),
  },
  input: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  hint: { fontSize: fontSize.xs, marginTop: hp(6), lineHeight: ms(16) },
  strengthWrap: { marginTop: hp(6) },
  strengthTrack: { height: ms(4), borderRadius: ms(2), overflow: 'hidden' },
  strengthBar: { height: '100%', borderRadius: ms(2) },
});

export const StepPassword = React.memo(StepPasswordInner);
