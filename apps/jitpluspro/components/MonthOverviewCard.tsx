import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { palette } from '@/contexts/ThemeContext';
import { getIntlLocale } from '@/config/currency';

const BAR_COUNT = 15;
const BAR_MAX_HEIGHT = 44;
const BAR_MIN_HEIGHT = 3;

export interface MonthOverviewData {
  /** Per-day scan counts for the current month (index 0 = day 1). */
  daily: number[];
}

/**
 * Translucent "month overview" card shown inside the brand-gradient header.
 * Renders a mini bar chart of daily scans for the current month, computed
 * entirely from data already loaded on the Accueil (no new data source).
 */
function MonthOverviewCard({ daily }: MonthOverviewData) {
  const { t, locale } = useLanguage();

  const { bars, total, activeIndex, todayIndex } = useMemo(() => {
    const daysInMonth = daily.length || 1;
    const todayDay = new Date().getDate(); // 1-based
    // Downsample the month into ~15 buckets spanning day 1..daysInMonth.
    const buckets: number[] = new Array(BAR_COUNT).fill(0);
    let todayBucket = BAR_COUNT - 1;
    for (let d = 0; d < daysInMonth; d++) {
      const b = Math.min(BAR_COUNT - 1, Math.floor((d / daysInMonth) * BAR_COUNT));
      buckets[b] += daily[d] ?? 0;
      if (d + 1 === todayDay) todayBucket = b;
    }
    let max = 0;
    let maxIdx = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i] > max) { max = buckets[i]; maxIdx = i; }
    }
    const sum = daily.reduce((acc, n) => acc + n, 0);
    return { bars: buckets, total: sum, activeIndex: max > 0 ? maxIdx : -1, todayIndex: todayBucket };
  }, [daily]);

  const maxBar = Math.max(1, ...bars);

  return (
    <View style={styles.card} accessible accessibilityRole="summary">
      <View style={styles.topRow}>
        <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('home.monthOverview')}
        </Text>
        <Text style={styles.value} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          <Text style={styles.valueNumber}>{total.toLocaleString(getIntlLocale(locale))}</Text>
          <Text style={styles.valueUnit}> {t('home.scans')}</Text>
        </Text>
      </View>

      <View style={styles.chart} importantForAccessibility="no-hide-descendants">
        {bars.map((v, i) => {
          const h = BAR_MIN_HEIGHT + (v / maxBar) * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT);
          const isActive = i === activeIndex;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                { height: h, backgroundColor: isActive ? palette.gold : 'rgba(255,255,255,0.18)' },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.axisRow} importantForAccessibility="no-hide-descendants">
        <Text style={styles.axisLabel}>1</Text>
        <Text style={styles.axisLabel}>8</Text>
        <Text style={styles.axisLabel}>15</Text>
        <Text style={styles.axisLabel}>22</Text>
        <Text style={styles.axisLabel}>{t('activity.today')}</Text>
      </View>
    </View>
  );
}

export default React.memo(MonthOverviewCard);

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    paddingHorizontal: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  value: { flexShrink: 0 },
  valueNumber: {
    fontSize: 16,
    color: palette.gold,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  valueUnit: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Lexend_500Medium',
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT,
    gap: 4,
  },
  bar: {
    flex: 1,
    borderRadius: 3,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  axisLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend_500Medium',
  },
});
