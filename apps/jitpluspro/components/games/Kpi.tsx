import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';

/** One figure of a game's detail page (already formatted) with its label. */
export function Kpi({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.kpi, { backgroundColor: theme.bgElevated }]}>
      <Text
        style={[styles.value, { color: theme.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.2}
      >
        {value}
      </Text>
      <Text style={[styles.label, { color: theme.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>{label}</Text>
    </View>
  );
}

/** Lays the figures out on one line, mirrored in Arabic. */
export function KpiRow({ children }: { children: React.ReactNode }) {
  const { row } = useDir();
  return <View style={[styles.row, { flexDirection: row }]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  kpi: { flex: 1, borderRadius: 12, padding: 10, gap: 4 },
  value: { fontSize: ms(17), fontFamily: font.semibold },
  label: { fontSize: ms(11), fontFamily: font.regular },
});
