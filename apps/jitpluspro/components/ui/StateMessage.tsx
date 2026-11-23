import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/AppText';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/contexts/ThemeContext';
import { safeImpact } from '@/utils/haptics';
import { font } from '@/constants/design';

/** Empty, no-result or error state of a list: plain icon, title, hint and an optional button. */
export function StateMessage({
  Icon,
  iconColor,
  title,
  hint,
  actionLabel,
  ActionIcon,
  actionVariant,
  onAction,
}: {
  /** Drawn plain above the title. */
  Icon?: LucideIcon;
  /** Defaults to the muted text color. */
  iconColor?: string;
  title: string;
  hint: string;
  actionLabel?: string;
  ActionIcon?: LucideIcon;
  actionVariant?: ComponentProps<typeof ActionButton>['variant'];
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      {Icon ? <Icon size={36} color={iconColor ?? theme.textMuted} strokeWidth={1.5} style={styles.icon} /> : null}
      <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.6}>{title}</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>{hint}</Text>
      {actionLabel && onAction ? (
        <ActionButton
          label={actionLabel}
          icon={ActionIcon}
          variant={actionVariant}
          style={styles.cta}
          onPress={() => {
            safeImpact(Haptics.ImpactFeedbackStyle.Light);
            onAction();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32 },
  icon: { marginBottom: 14 },
  title: { fontSize: 20, fontFamily: font.semibold, letterSpacing: -0.3, textAlign: 'center' },
  hint: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22, fontFamily: font.regular },
  cta: { marginTop: 24, paddingHorizontal: 24 },
});
