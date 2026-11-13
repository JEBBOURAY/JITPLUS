import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';

interface SummaryStat {
  label: string;
  value: string | number;
}

interface Props {
  label: string;
  value: string | number;
  /** Shown muted after the value, as in "2/3". */
  max?: number | null;
  /** Figures under the headline, in equal columns. */
  stats?: SummaryStat[];
  /** Fills a thin bar under the headline (0 to 1). */
  progress?: number;
  /** Muted line under the headline. */
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Key figures at the top of a list screen (Bons plans, Mon équipe, QR livraison):
 * a label with its big number, then a row of figures, a progress bar or a hint.
 * Same card as the "Mes outils" cards of Accueil.
 */
export function SummaryCard({ label, value, max, stats, progress, hint, style }: Props) {
  const theme = useTheme();
  const { row, textAlign } = useDir();
  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }, style]}>
      <View style={[styles.top, { flexDirection: row }]}>
        <Text style={[styles.label, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>{label}</Text>
        <Text
          style={[styles.value, { color: theme.text }]}
          maxFontSizeMultiplier={1.2}
          accessibilityLabel={max != null ? `${value}/${max}` : String(value)}
        >
          {value}
          {max != null && <Text style={[styles.max, { color: theme.textMuted }]}>/{max}</Text>}
        </Text>
      </View>
      {progress != null && <ProgressBar ratio={progress} />}
      {hint ? (
        <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{hint}</Text>
      ) : null}
      {stats && stats.length > 0 ? (
        <View style={[styles.strip, { flexDirection: row, borderTopColor: theme.borderLight }]}>
          {stats.map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
              <View style={styles.stat} accessible accessibilityLabel={`${stat.label}, ${stat.value}`}>
                <Text style={[styles.statValue, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{stat.value}</Text>
                <Text
                  style={[styles.statLabel, { color: theme.textMuted }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  maxFontSizeMultiplier={1.2}
                >
                  {stat.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Thin bar filled from the reading side (mirrored in Arabic). */
export function ProgressBar({ ratio }: { ratio: number }) {
  const theme = useTheme();
  const { alignStart } = useDir();
  const width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` as const;
  return (
    <View style={[styles.track, { backgroundColor: theme.borderLight }]} importantForAccessibility="no">
      <View style={[styles.fill, { width, backgroundColor: theme.primary, alignSelf: alignStart }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 12 },
  top: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flex: 1, fontSize: 15, fontFamily: font.medium },
  value: { fontSize: 28, lineHeight: 34, fontFamily: font.semibold, letterSpacing: -0.8 },
  max: { fontSize: 16, fontFamily: font.semibold, letterSpacing: 0 },
  hint: { fontSize: ms(12), fontFamily: font.regular },
  strip: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 6, gap: 2 },
  statValue: { fontSize: 17, fontFamily: font.semibold, letterSpacing: -0.2 },
  statLabel: { fontSize: 12, fontFamily: font.medium },
  divider: { width: StyleSheet.hairlineWidth, height: 28 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
