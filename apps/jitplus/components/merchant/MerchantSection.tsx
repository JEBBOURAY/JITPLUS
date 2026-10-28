import { type ReactNode } from 'react';
import { View, Pressable, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/AppText';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms } from '@/utils/responsive';

interface Props {
  title?: string;
  icon?: LucideIcon;
  accent: string;
  /** Rendered at the end of the title row (count, status pill…). */
  right?: ReactNode;
  /** Link at the end of the title row, e.g. "Voir tout" toward a tab. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Card shell shared by every section of the merchant page. */
export default function MerchantSection({ title, icon: Icon, accent, right, action, children, style }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }, style]}>
      {!!title && (
        <View style={styles.header}>
          {Icon && (
            <View style={[styles.icon, { backgroundColor: `${accent}14` }]}>
              <Icon size={ms(16)} color={accent} strokeWidth={2} />
            </View>
          )}
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {right}
          {action && (
            <Pressable onPress={() => { haptic(); action.onPress(); }} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.action, { color: accent, fontFamily: fonts.semibold }]}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: ms(22),
    borderWidth: StyleSheet.hairlineWidth,
    padding: wp(16),
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 14 },
      android: { elevation: 1 },
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: wp(10), marginBottom: hp(14) },
  icon: { width: ms(32), height: ms(32), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: ms(16), letterSpacing: -0.2 },
  action: { fontSize: ms(13) },
});
