import { forwardRef, memo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { X, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';

interface ProfileTextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  icon: LucideIcon;
  /** Small suffix next to the label, e.g. "(optionnel)". */
  labelHint?: string;
  /** Rendered on the label line, aligned to the end (e.g. a verification badge). */
  badge?: ReactNode;
  /** Shows a clear button while the field has a value; the string is its accessibility label. */
  clearLabel?: string;
}

interface FieldLabelProps {
  label: string;
  labelHint?: string;
  badge?: ReactNode;
}

export const FieldLabel = memo(function FieldLabel({ label, labelHint, badge }: FieldLabelProps) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
        {label}
        {!!labelHint && <Text style={{ color: theme.textMuted, fontFamily: fonts.regular }}>{`  ${labelHint}`}</Text>}
      </Text>
      {badge}
    </View>
  );
});

/** Labelled input matching PremiumPhoneInput (same height, radius and focus ring). */
const ProfileTextField = forwardRef<TextInput, ProfileTextFieldProps>(function ProfileTextField(
  { label, icon: Icon, labelHint, badge, clearLabel, value, onChangeText, onFocus, onBlur, ...inputProps },
  ref,
) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <FieldLabel label={label} labelHint={labelHint} badge={badge} />
      <View
        style={[
          styles.inputBox,
          {
            backgroundColor: theme.inputBg,
            borderColor: focused ? theme.primary : theme.inputBorder,
            borderWidth: focused ? 2 : 1.5,
          },
        ]}
      >
        <Icon size={ms(17)} color={focused ? theme.primary : theme.inputPlaceholder} strokeWidth={1.8} />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={theme.inputPlaceholder}
          selectionColor={theme.primary}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[styles.input, { color: theme.text, fontFamily: fonts.medium }]}
          accessibilityLabel={label}
          {...inputProps}
        />
        {!!clearLabel && !!value && (
          <Pressable
            onPress={() => onChangeText?.('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            style={[styles.clearBtn, { backgroundColor: theme.border }]}
          >
            <X size={ms(12)} color={theme.textSecondary} strokeWidth={2.5} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

export default memo(ProfileTextField);

const styles = StyleSheet.create({
  wrap: { marginBottom: hp(16) },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(8),
    marginBottom: hp(6),
    marginHorizontal: wp(2),
  },
  label: { fontSize: FS.sm, flexShrink: 1, textAlign: 'left' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    height: hp(56),
  },
  input: { flex: 1, fontSize: FS.md, paddingVertical: 0, textAlign: 'left' },
  clearBtn: {
    width: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
