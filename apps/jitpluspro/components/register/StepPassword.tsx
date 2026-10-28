import React, { RefObject, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Eye, EyeOff, Check } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { isValidPassword, getPasswordStrength } from '@/utils/passwordStrength';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { palette } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
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
  const dir = useDir();

  return (
    <>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('register.passwordLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              flexDirection: dir.row,
              backgroundColor: theme.bgInput,
              borderColor:
                password.length === 0 ? theme.border
                  : pwValid ? palette.charbon
                  : theme.danger,
              borderWidth: pwValid ? 2 : 1.5,
            },
          ]}
        >
          <JitLock size={ms(18)} color={pwValid ? palette.charbon : theme.textMuted} strokeWidth={icon.stroke} />
          <TextInput
            ref={passwordRef}
            style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
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
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
          >
            {showPassword
              ? <EyeOff size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} />
              : <Eye size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} />}
          </TouchableOpacity>
          {pwValid && (
            <Check size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />
          )}
        </View>
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
                styles.hintTight,
                { color: pwValid ? theme.success : theme.danger, textAlign: dir.textAlign },
              ]}
            >
              {!pwValid
                ? t('registerExtra.passwordRequirements')
                : strength.label}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('registerExtra.confirmPasswordLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              flexDirection: dir.row,
              backgroundColor: theme.bgInput,
              borderColor:
                confirmPassword.length === 0 ? theme.border
                  : passwordsMatch ? palette.charbon
                  : theme.danger,
              borderWidth: passwordsMatch ? 2 : 1.5,
            },
          ]}
        >
          <JitLock size={ms(18)} color={passwordsMatch ? palette.charbon : theme.textMuted} strokeWidth={icon.stroke} />
          <TextInput
            ref={confirmRef}
            style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('registerExtra.confirmPasswordPlaceholder')}
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            editable={!isLoading}
            returnKeyType="done"
          />
          {passwordsMatch && (
            <Check size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />
          )}
        </View>
        {showMismatch && (
          <Text style={[styles.hint, { color: theme.danger, textAlign: dir.textAlign }]}>
            {t('registerExtra.passwordMismatch')}
          </Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: hp(20) },
  label: { fontSize: fontSize.sm, fontFamily: font.bold, marginBottom: hp(8) },
  inputRow: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: wp(14),
    height: hp(52),
    gap: wp(10),
  },
  input: { flex: 1, fontSize: fontSize.md, fontFamily: font.medium },
  hint: { fontSize: fontSize.xs, marginTop: hp(6), lineHeight: ms(16), fontFamily: font.regular },
  hintTight: { marginTop: 4 },
  strengthWrap: { marginTop: hp(6) },
  strengthTrack: { height: ms(4), borderRadius: ms(2), overflow: 'hidden' },
  strengthBar: { height: '100%', borderRadius: ms(2) },
});

export const StepPassword = React.memo(StepPasswordInner);
