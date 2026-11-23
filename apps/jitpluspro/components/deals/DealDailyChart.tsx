import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import type { DealDailyStat } from '@jitplus/shared/src/deals';
import { addDaysYmd, diffDaysYmd } from '@jitplus/shared/src/scratch';
import { formatYmd } from '@/components/scratch/DateField';

/** Days drawn at most: the last ones of the period. */
const MAX_DAYS = 14;
const BAR_AREA = 72;
const MIN_BAR = 3;

/** Views of each day from `fromYmd` to `toYmd`; a day without activity counts 0. */
export function dailyViews(daily: readonly DealDailyStat[], fromYmd: string, toYmd: string): { day: string; views: number }[] {
  const length = Math.min(MAX_DAYS, Math.max(1, diffDaysYmd(fromYmd, toYmd) + 1));
  const first = addDaysYmd(toYmd, 1 - length);
  const byDay = new Map(daily.map((d) => [d.day, d.views]));
  return Array.from({ length }, (_, i) => {
    const day = addDaysYmd(first, i);
    return { day, views: byDay.get(day) ?? 0 };
  });
}

/** Views per day of a deal, as bars: enough to see whether it still draws attention. */
export const DealDailyChart = React.memo(function DealDailyChart({ daily, fromYmd, toYmd }: {
  daily: readonly DealDailyStat[];
  fromYmd: string;
  toYmd: string;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row } = useDir();
  const days = useMemo(() => dailyViews(daily, fromYmd, toYmd), [daily, fromYmd, toYmd]);
  const peak = Math.max(1, ...days.map((d) => d.views));
  const total = days.reduce((sum, d) => sum + d.views, 0);
  const start = formatYmd(days[0].day, locale, false);
  const end = formatYmd(days[days.length - 1].day, locale, false);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('deals.detail.chartA11y', { count: total, start, end })}>
      <View style={[styles.bars, { flexDirection: row }]}>
        {days.map((d) => (
          <View
            key={d.day}
            style={[
              styles.bar,
              { height: Math.max(MIN_BAR, Math.round((d.views / peak) * BAR_AREA)), backgroundColor: d.views > 0 ? theme.primary : theme.borderLight },
            ]}
          />
        ))}
      </View>
      <View style={[styles.axis, { flexDirection: row }]}>
        <Text style={[styles.axisText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{start}</Text>
        {days.length > 1 && <Text style={[styles.axisText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{end}</Text>}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bars: { height: BAR_AREA, alignItems: 'flex-end', gap: 4 },
  bar: { flex: 1, borderRadius: 4 },
  axis: { justifyContent: 'space-between', marginTop: 6 },
  axisText: { fontSize: ms(11), fontFamily: font.regular },
});
