import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import type { HomeStats } from '@/hooks/queries/transactions';
import MonthOverviewCard from '@/components/MonthOverviewCard';
import KpiCounter from '@/components/KpiCounter';
import HeroWave from '@/components/home/HeroWave';
import { radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';

// Height of the page-coloured wave that closes the hero.
const HERO_WAVE = 30;
// Stable empty reference so MonthOverviewCard doesn't re-render before stats load.
const EMPTY_DAILY: number[] = [];

interface Props {
  stats: HomeStats | undefined;
  loading: boolean;
  /** Statistics are a Pro feature: shows the lock marker on the month chart. */
  locked: boolean;
  /** Space taken by the status bar and the floating header above the content. */
  topInset: number;
  /** Colour of the page under the hero, for the wave that closes it. */
  pageColor: string;
  onPress: () => void;
}

/**
 * Violet hero of Accueil: today's stamps, the change since yesterday and the
 * month chart. The whole block opens the statistics.
 */
function HomeHero({ stats, loading, locked, topInset, pageColor, onPress }: Props) {
  const { t } = useLanguage();
  const dir = useDir();
  const { width } = useWindowDimensions();

  const { kpiValue, hasDelta, deltaPct, deltaSign, deltaPositive, clientsToday } = useMemo(() => {
    const today = stats?.today.stamps ?? 0;
    const yesterday = stats?.yesterday.stamps ?? 0;
    // No stamps yesterday: a percentage would read "+100 %" whatever today is, so hide it.
    const rawDelta = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : 0;
    return {
      kpiValue: today,
      hasDelta: yesterday > 0,
      deltaPct: Math.abs(rawDelta),
      deltaSign: rawDelta >= 0 ? '+' : '−',
      deltaPositive: rawDelta >= 0,
      clientsToday: stats?.today.clients ?? 0,
    };
  }, [stats]);

  const deltaText = t('home.vsYesterday', { sign: deltaSign, percent: deltaPct });
  const clientsText = t(clientsToday === 1 ? 'home.clientsScanned_one' : 'home.clientsScanned_other', { count: clientsToday });
  const DeltaIcon = deltaPositive ? TrendingUp : TrendingDown;

  return (
    <View style={[styles.hero, { paddingTop: topInset }]}>

      {/* The label carries the figures: a screen reader would otherwise only hear "view statistics". */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={[`${t('home.kpiStamps')}: ${kpiValue}`, hasDelta ? deltaText : null, clientsText].filter(Boolean).join('. ')}
        accessibilityHint={t('home.viewStats')}
      >
        <View style={styles.kpiBlock}>
          <Text style={styles.kpiLabel} maxFontSizeMultiplier={1.3}>
            {t('home.kpiStamps')}
          </Text>
          <KpiCounter value={kpiValue} ready={!loading} style={styles.kpiValue} />
          {hasDelta && (
            <View style={[styles.deltaPill, { flexDirection: dir.row }]}>
              <DeltaIcon size={15} color="#fff" strokeWidth={icon.strokeSmall} />
              <Text style={styles.deltaText} maxFontSizeMultiplier={1.3}>
                {deltaText}
              </Text>
            </View>
          )}
          <Text style={styles.kpiSub} maxFontSizeMultiplier={1.3}>
            {clientsText}
          </Text>
        </View>

        <MonthOverviewCard daily={stats?.month.daily ?? EMPTY_DAILY} locked={locked} />
      </TouchableOpacity>

      {/* Page-coloured wave: the hero ends on a soft edge. */}
      <HeroWave width={width} height={HERO_WAVE} color={pageColor} />
    </View>
  );
}

export default React.memo(HomeHero);

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingBottom: HERO_WAVE + 24,
    overflow: 'hidden',
    backgroundColor: palette.violetDark,
  },
  kpiBlock: {
    alignItems: 'center',
    paddingTop: 16,
  },
  kpiLabel: {
    fontSize: 14,
    color: palette.heroMuted,
    fontFamily: font.medium,
    textAlign: 'center',
  },
  kpiValue: {
    marginTop: 4,
    fontSize: 68,
    lineHeight: 80,
    color: '#fff',
    fontFamily: font.semibold,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  deltaPill: {
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  deltaText: {
    fontSize: 14,
    color: '#fff',
    fontFamily: font.medium,
  },
  kpiSub: {
    marginTop: 12,
    fontSize: 14,
    color: palette.heroMuted,
    fontFamily: font.medium,
  },
});
