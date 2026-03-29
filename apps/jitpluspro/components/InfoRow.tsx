import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { ms, wp, hp, fontSize as FS } from '@/utils/responsive';

interface InfoRowProps {
  /** Lucide icon element */
  icon: React.ReactNode;
  /** Primary label */
  label: string;
  /** Secondary subtitle text */
  subtitle?: string;
  /** Callback when pressed */
  onPress?: () => void;
  /** Optional trailing element (toggle, badge, chevron) */
  right?: React.ReactNode;
  /** Whether to hide the bottom border (last item in a section) */
  noBorder?: boolean;
  /** Icon background color override */
  iconBg?: string;
}

export default React.memo(function InfoRow({
  icon,
  label,
  subtitle,
  onPress,
  right,
  noBorder,
  iconBg,
}: InfoRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: `${palette.charbon}10` } : undefined}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.borderLight },
        noBorder && { borderBottomWidth: 0 },
        pressed && onPress && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: iconBg ?? `${palette.charbon}12` }]}>
        {icon}
      </View>
      <View style={styles.content}>
        <Text style={[styles.value, { color: theme.text }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.label, { color: theme.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    gap: wp(12),
    borderBottomWidth: 0.5,
  },
  iconBox: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  label: { fontSize: FS.xs, marginBottom: hp(2) },
  value: { fontSize: FS.md, fontWeight: '500' },
});
