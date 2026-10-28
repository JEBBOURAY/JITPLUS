import { type ReactNode } from 'react';
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms } from '@/utils/responsive';

interface Props {
  title?: string;
  /** Rendered at the end of the title row (count, status…). */
  right?: ReactNode;
  /** Link at the end of the title row, e.g. "Voir tout" toward a tab. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Flat block of the merchant page, separated from the next one by a hairline. */
export default function FicheSection({ title, right, action, children, style }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();

  return (
    <View style={[styles.section, { borderBottomColor: theme.border }, style]}>
      {!!title && (
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {right}
          {action && (
            <Pressable onPress={() => { haptic(); action.onPress(); }} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.action, { color: theme.primary, fontFamily: fonts.semibold }]}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: hp(18), borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', gap: wp(10), marginBottom: hp(12) },
  title: { flex: 1, fontSize: ms(17), letterSpacing: -0.2 },
  action: { fontSize: ms(14) },
});
