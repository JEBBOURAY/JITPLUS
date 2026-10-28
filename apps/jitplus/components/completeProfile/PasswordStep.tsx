import { memo } from 'react';
import type { RefObject } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { CheckCircle2, Lock, Eye, EyeOff, Shield } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { StrengthBar } from './StrengthBar';
import { s, ICON_16, ICON_18, ICON_20 } from './styles';
import type { TranslateFn } from './types';

interface PasswordStepProps {
  theme: ThemeColors;
  t: TranslateFn;
  showPasswordStep: boolean;
  password: string;
  confirmPassword: string;
  isValidPw: boolean;
  passwordsMatch: boolean;
  canNext: boolean;
  showPw: boolean;
  showConfirm: boolean;
  strength: { pct: number; color: string; label: string };
  pwRef: RefObject<TextInput | null>;
  confirmRef: RefObject<TextInput | null>;
  onPwChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onToggleShowPw: () => void;
  onToggleShowConfirm: () => void;
  onNext: () => void;
}

export const PasswordStep = memo(function PasswordStep({
  theme, t, showPasswordStep, password, confirmPassword, isValidPw, passwordsMatch, canNext,
  showPw, showConfirm, strength, pwRef, confirmRef,
  onPwChange, onConfirmChange, onToggleShowPw, onToggleShowConfirm, onNext,
}: PasswordStepProps) {
  return (
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
              <Lock size={ICON_18} color={isValidPw ? palette.violet : theme.textMuted} strokeWidth={2} />
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
              <TouchableOpacity onPress={onToggleShowPw} activeOpacity={0.7}>
                {showPw
                  ? <EyeOff size={ICON_20} color={theme.textMuted} strokeWidth={2} />
                  : <Eye size={ICON_20} color={theme.textMuted} strokeWidth={2} />}
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
              <CheckCircle2 size={ICON_18} color={passwordsMatch ? palette.violet : theme.textMuted} strokeWidth={2} />
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
                onSubmitEditing={canNext ? onNext : undefined}
              />
              <TouchableOpacity onPress={onToggleShowConfirm} activeOpacity={0.7}>
                {showConfirm
                  ? <EyeOff size={ICON_20} color={theme.textMuted} strokeWidth={2} />
                  : <Eye size={ICON_20} color={theme.textMuted} strokeWidth={2} />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.infoBox, { backgroundColor: `${palette.gold}08` }]}>
            <Shield size={ICON_16} color={palette.gold} strokeWidth={1.5} />
            <Text style={[s.infoText, { color: theme.textMuted }]}>
              {t('completeProfile.passwordHint')}
            </Text>
          </View>
        </>
      ) : (
        <View style={s.noPasswordBlock}>
          <View style={[s.noPasswordIcon, { backgroundColor: `${palette.violet}10` }]}>
            <CheckCircle2 size={ms(32)} color={palette.violet} strokeWidth={2} />
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
  );
});
