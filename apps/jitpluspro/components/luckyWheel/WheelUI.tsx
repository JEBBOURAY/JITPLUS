import { View, Text, StyleSheet } from 'react-native';
import { prizeColor, LOST_COLOR, type WheelSegment } from '@jitplus/shared/src/luckyWheel';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { StatusPill } from '@/components/scratch/ScratchUI';
import { formatYmd } from '@/components/scratch/DateField';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import { WheelTile } from './WheelStage';
import { WHEEL_STATUS_COLORS } from './colors';
import type { WheelCampaign, WheelStatus } from './types';

export function WheelStatusPill({ status }: { status: WheelStatus }) {
  const { t } = useLanguage();
  return <StatusPill label={t(`luckyWheel.status.${status}`)} color={WHEEL_STATUS_COLORS[status]} />;
}

/** "19 oct. → 17 nov." in Morocco time. */
export function formatWheelPeriod(campaign: Pick<WheelCampaign, 'startsAt' | 'endsAt'>, locale: string): string {
  const start = formatYmd(moroccoYmdOf(new Date(campaign.startsAt)), locale, false);
  const end = formatYmd(moroccoYmdOf(new Date(campaign.endsAt)), locale, false);
  return `${start} → ${end}`;
}

/** Colour dot, prize name and its share of spins, then the "lost" share. */
function ChanceLegend({ labels, perPrize, lostPct }: { labels: string[]; perPrize: number[]; lostPct: number }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const line = (key: string, color: string, label: string, pct: number, muted?: boolean) => (
    <View key={key} style={[styles.legendRow, { flexDirection: row }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={[styles.legendLabel, { color: muted ? theme.textMuted : theme.text, textAlign }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
      <Text style={[styles.legendPct, { color: muted ? theme.textMuted : theme.text }]} maxFontSizeMultiplier={1.3}>
        {pct} %
      </Text>
    </View>
  );
  return (
    <View style={styles.legend}>
      {labels.map((label, i) => line(`p${i}`, prizeColor(i), label, perPrize[i] ?? 0))}
      {line('lost', LOST_COLOR, t('luckyWheel.preview.lostSlice'), lostPct, true)}
    </View>
  );
}

/** Small wheel next to the chances: keeps the result of each choice visible while configuring. */
export function WheelSummaryCard({ segments, labels, perPrize, lostPct, caption }: {
  segments: WheelSegment[];
  labels: string[];
  perPrize: number[];
  lostPct: number;
  caption: string;
}) {
  const theme = useTheme();
  const { row, textAlign } = useDir();
  return (
    <View style={[styles.summary, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      <Text style={[styles.caption, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
        {caption}
      </Text>
      <View style={[styles.summaryRow, { flexDirection: row }]}>
        <WheelTile size={ms(112)} segments={segments} />
        <ChanceLegend labels={labels} perPrize={perPrize} lostPct={lostPct} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  summaryRow: { alignItems: 'center', gap: 14 },
  caption: { fontSize: ms(12), fontFamily: font.medium },
  legend: { flex: 1, gap: 6 },
  legendRow: { alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: ms(13), fontFamily: font.medium },
  legendPct: { fontSize: ms(13), fontFamily: font.semibold },
});
