import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Lock, Eye, EyeOff, Shield } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { StrengthBar } from './StrengthBar';
import { s, ICON_16, ICON_18, ICON_20 } from './styles';
import type { TranslateFn } from './types';

interface PasswordStepProps {
  theme: ThemeColors;
  t: TranslateFn;
  password: string;
  isValidPw: boolean;
  showPw: boolean;
  strength: { pct: number; color: string; label: string };
  onPwChange: (v: string) => void;
  onToggleShowPw: () => void;
  onNext: () => void;
  onSkip: () => void;
}

/** Optional password of an email sign-up: one field, its rules once typing starts, and a way to skip. */
export const PasswordStep = memo(function PasswordStep({
  theme, t, password, isValidPw, showPw, strength, onPwChange, onToggleShowPw, onNext, onSkip,
}: PasswordStepProps) {
  return (
    <View>
      <View style={s.field}>
        <Text style={[s.label, { color: theme.textSecondary }]}>{t('setPassword.placeholder')}</Text>
        <View style={[s.inputWrap, {
          backgroundColor: theme.bgInput,
          borderColor: isValidPw ? palette.violet : theme.border,
          borderWidth: isValidPw ? 2 : 1.5,
        }]}>
          <Lock size={ICON_18} color={isValidPw ? palette.violet : theme.textMuted} strokeWidth={2} />
          <TextInput
            style={[s.input, { color: theme.text }]}
            placeholder={t('setPassword.placeholder')}
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={onPwChange}
            secureTextEntry={!showPw}
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={isValidPw ? onNext : undefined}
          />
          <TouchableOpacity onPress={onToggleShowPw} activeOpacity={0.7}>
            {showPw
              ? <EyeOff size={ICON_20} color={theme.textMuted} strokeWidth={2} />
              : <Eye size={ICON_20} color={theme.textMuted} strokeWidth={2} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* The rules only matter once a password is being typed. */}
      {password.length > 0 && (
        <>
          <StrengthBar pct={strength.pct} color={strength.color} label={strength.label} />
          <View style={[s.infoBox, { backgroundColor: `${palette.gold}08` }]}>
            <Shield size={ICON_16} color={palette.gold} strokeWidth={1.5} />
            <Text style={[s.infoText, { color: theme.textMuted }]}>
              {t('completeProfile.passwordHint')}
            </Text>
          </View>
        </>
      )}

      <TouchableOpacity onPress={onSkip} accessibilityRole="button" hitSlop={8} style={s.skipLink}>
        <Text style={[s.skipLinkText, { color: palette.violet }]}>{t('completeProfile.skipPassword')}</Text>
      </TouchableOpacity>
    </View>
  );
});
