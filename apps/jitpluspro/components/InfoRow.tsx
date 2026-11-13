import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type AccessibilityState, type AccessibilityRole } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ms, wp, hp, radius, fontSize as FS } from '@/utils/responsive';

interface InfoRowProps {
  /** Lucide or Jit icon component, drawn in the row's tinted icon box */
  Icon: LucideIcon;
  /** Primary label */
  label: string;
  /** Secondary subtitle text */
  subtitle?: string;
  /** Callback when pressed */
  onPress?: () => void;
  /** Optional trailing element (toggle, badge) */
  right?: React.ReactNode;
  /** Trailing chevron: the row opens another screen */
  chevron?: boolean;
  /** Whether to hide the bottom border (last item in a section) */
  noBorder?: boolean;
  /** Charcoal icon instead of the brand violet (informational rows) */
  neutral?: boolean;
  /** Mirror the icon in RTL (directional glyphs such as "log out") */
  flipIcon?: boolean;
  /** Accessibility state forwarded to the Pressable (e.g. { checked, expanded, disabled }) */
  accessibilityState?: AccessibilityState;
  /** Override the default accessibility role (defaults to 'button' when onPress is set) */
  accessibilityRole?: AccessibilityRole;
}

export default React.memo(function InfoRow({
  Icon,
  label,
  subtitle,
  onPress,
  right,
  chevron,
  noBorder,
  neutral,
  flipIcon,
  accessibilityState,
  accessibilityRole,
}: InfoRowProps) {
  const theme = useTheme();
  const dir = useDir();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: `${palette.charbon}10` } : undefined}
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [
        styles.row,
        { flexDirection: dir.row, borderBottomColor: theme.borderLight },
        noBorder && { borderBottomWidth: 0 },
        pressed && onPress && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: neutral ? `${palette.charbon}12` : theme.primaryBg }]}>
        <Icon
          size={ms(16)}
          color={neutral ? palette.charbon : palette.violet}
          strokeWidth={icon.stroke}
          style={flipIcon ? dir.flip : undefined}
        />
      </View>
      <View style={styles.content}>
        <Text style={[styles.value, { color: theme.text, textAlign: dir.textAlign }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.label, { color: theme.textMuted, textAlign: dir.textAlign }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
      {chevron ? (
        <ChevronRight size={ms(16)} color={theme.textMuted} strokeWidth={icon.stroke} style={dir.flip} />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    minHeight: ms(44),
    gap: wp(12),
    borderBottomWidth: 0.5,
  },
  iconBox: {
    width: ms(36),
    height: ms(36),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  label: { fontSize: FS.xs, marginBottom: hp(2), fontFamily: font.regular },
  value: { fontSize: FS.md, fontFamily: font.medium },
});
