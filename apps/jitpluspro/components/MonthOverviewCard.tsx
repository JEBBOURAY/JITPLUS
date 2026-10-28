import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { useLanguage } from '@/contexts/LanguageContext';
import { palette } from '@/contexts/ThemeContext';
import { getIntlLocale } from '@/config/currency';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

const BAR_COUNT = 15;
const BAR_MAX_HEIGHT = 36;
const BAR_MIN_HEIGHT = 3;
const BAR_PAST = 'rgba(255,255,255,0.26)';
const BAR_FUTURE = 'rgba(255,255,255,0.10)';

interface MonthOverviewData {
  /** Per-day scan counts for the current month (index 0 = day 1). */
  daily: number[];
  /** Shows a lock marker next to the chevron (statistics are premium-gated). */
  locked?: boolean;
}

/**
 * Month overview on the Accueil header: mini bar chart of daily scans for the
 * current month. Today's bucket is the only gold accent on the header.
 */
function MonthOverviewCard({ daily, locked = false }: MonthOverviewData) {
  const { t, locale } = useLanguage();
  const dir = useDir();

  const { bars, total, todayIndex } = useMemo(() => {
    const now = new Date();
    const daysInMonth = daily.length || new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // Downsample the month into ~15 buckets spanning day 1..daysInMonth.
    const buckets: number[] = new Array(BAR_COUNT).fill(0);
    for (let d = 0; d < daysInMonth; d++) {
      const b = Math.min(BAR_COUNT - 1, Math.floor((d / daysInMonth) * BAR_COUNT));
      buckets[b] += daily[d] ?? 0;
    }
    const todayDay = Math.min(daysInMonth, now.getDate()) - 1;
    const todayBucket = Math.min(BAR_COUNT - 1, Math.floor((todayDay / daysInMonth) * BAR_COUNT));
    const sum = daily.reduce((acc, n) => acc + n, 0);
    return { bars: buckets, total: sum, todayIndex: todayBucket };
  }, [daily]);

  const maxBar = Math.max(1, ...bars);

  return (
    <View style={styles.card} accessible accessibilityRole="summary">
      <View style={styles.topRow}>
        <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('home.monthOverview')}
        </Text>
        <View style={styles.trailing}>
          <Text style={styles.value} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            <Text style={styles.valueNumber}>{total.toLocaleString(getIntlLocale(locale))}</Text>
            <Text style={styles.valueUnit}> {t('home.scans')}</Text>
          </Text>
          {locked && <JitLock size={12} color={palette.heroMuted} strokeWidth={icon.strokeSmall} />}
          <ChevronRight size={15} color={palette.heroMuted} strokeWidth={icon.strokeSmall} style={dir.flip} />
        </View>
      </View>

      <View style={styles.chart} importantForAccessibility="no-hide-descendants">
        {bars.map((v, i) => {
          const h = BAR_MIN_HEIGHT + (v / maxBar) * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT);
          const color = i === todayIndex ? palette.gold : i < todayIndex ? BAR_PAST : BAR_FUTURE;
          return <View key={i} style={[styles.bar, { height: h, backgroundColor: color }]} />;
        })}
      </View>
    </View>
  );
}

export default React.memo(MonthOverviewCard);

const styles = StyleSheet.create({
  card: {
    marginTop: 22,
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
    color: palette.heroMuted,
    fontFamily: font.medium,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  value: { flexShrink: 0 },
  valueNumber: {
    fontSize: 14,
    color: '#fff',
    fontFamily: font.semibold,
    letterSpacing: -0.2,
  },
  valueUnit: {
    fontSize: 13,
    color: palette.heroMuted,
    fontFamily: font.medium,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT,
    gap: 6,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
  },
});
