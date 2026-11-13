import { memo, useCallback, useState, type RefObject } from 'react';
import { StyleSheet, TouchableOpacity, View, type TextInput as RNTextInput } from 'react-native';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { MAX_PASSWORD_LENGTH } from '@/utils/passwordStrength';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

interface PasswordFieldProps {
  inputRef?: RefObject<RNTextInput | null>;
  icon: LucideIcon;
  /** Shown above the input. */
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Requirement met: violet border and icon. */
  valid?: boolean;
  /** Error border; takes precedence over `valid`. */
  invalid?: boolean;
  autoFocus?: boolean;
  returnKeyType: 'next' | 'done';
  onSubmitEditing?: () => void;
}

/** Password input with its own show/hide toggle, so toggling re-renders the field only. */
export const PasswordField = memo(function PasswordField({
  inputRef, icon: Icon, label, value, onChangeText, placeholder, valid = false, invalid = false,
  autoFocus, returnKeyType, onSubmitEditing,
}: PasswordFieldProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const toggleVisible = useCallback(() => setVisible((v) => !v), []);
  const EyeIcon = visible ? EyeOff : Eye;

  return (
    <View style={styles.inputContainer}>
      {label ? <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text> : null}
      <View style={[styles.inputWrapper, {
        backgroundColor: theme.inputBg,
        borderColor: invalid ? theme.danger : valid ? palette.violet : theme.inputBorder,
        borderWidth: valid ? 2 : 1.5,
      }]}>
        <Icon size={ms(18)} color={valid ? palette.violet : theme.inputPlaceholder} strokeWidth={2} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.inputPlaceholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          maxLength={MAX_PASSWORD_LENGTH}
          onSubmitEditing={onSubmitEditing}
        />
        <TouchableOpacity
          onPress={toggleVisible}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={visible ? t('login.hidePassword') : t('login.showPassword')}
        >
          <EyeIcon size={ms(20)} color={theme.inputPlaceholder} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

/** Strength meter shown under the new password once something is typed. */
export function PasswordStrengthBar({ strength }: { strength: { pct: number; color: string; label: string } }) {
  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthBarTrack}>
        <View style={[styles.strengthBarFill, { width: `${strength.pct * 100}%`, backgroundColor: strength.color }]} />
      </View>
      <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: fontSize.xs, fontWeight: '600', marginBottom: hp(6), marginLeft: wp(4) },
  inputContainer: { marginBottom: hp(16) },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, paddingHorizontal: wp(14), height: hp(58),
  },
  input: { flex: 1, fontSize: fontSize.md, fontWeight: '500', marginLeft: wp(10) },
  strengthContainer: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    marginTop: -hp(8), marginBottom: hp(16), paddingHorizontal: wp(4),
  },
  strengthBarTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  strengthBarFill: { height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: fontSize.xs, fontWeight: '600', width: wp(48) },
});
