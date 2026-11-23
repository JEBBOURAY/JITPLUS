import { type ReactNode } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, fontSize, radius } from '@/utils/responsive';

interface Props {
  title?: string;
  /** Link at the end of the title row, e.g. "Voir tout" toward a tab. */
  action?: { label: string; onPress: () => void };
  /**
   * `card` (default): padded white card. `list`: card whose rows bring their own
   * vertical padding. `plain`: no shell, for children that are already cards.
   */
  variant?: 'card' | 'list' | 'plain';
  children: ReactNode;
}

/** Block of the merchant page: a title on the page background, then one white card. */
export default function FicheSection({ title, action, variant = 'card', children }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();

  return (
    <View style={styles.section}>
      {!!title && (
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {action && (
            <Pressable onPress={() => { haptic(); action.onPress(); }} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.action, { color: theme.primary, fontFamily: fonts.semibold }]}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {variant === 'plain' ? children : (
        <View style={[styles.card, variant === 'list' && styles.list, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: hp(24) },
  header: { flexDirection: 'row', alignItems: 'center', gap: wp(12), marginBottom: hp(12), paddingHorizontal: wp(4) },
  title: { flex: 1, fontSize: fontSize.lg, letterSpacing: -0.2 },
  action: { fontSize: fontSize.sm },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: wp(16) },
  list: { paddingVertical: hp(6) },
});
