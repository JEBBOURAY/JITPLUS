import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gift } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import type { LuckyWheelPrize } from '@/types';
import { computeOddsBreakdown, LOST_COLOR, prizeColor } from '@/utils/luckyWheel';
import { hp, ms, fontSize as FS, radius } from '@/utils/responsive';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  prizes: LuckyWheelPrize[];
  globalWinRate: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/** Prizes with their odds. Kept visible for App Store / Google Play odds disclosure. */
export default React.memo(function WheelPrizeList({ prizes, globalWinRate, fonts, t }: Props) {
  const { perPrize, lostPct } = useMemo(
    () => computeOddsBreakdown(prizes, globalWinRate),
    [prizes, globalWinRate],
  );
  const winPct = 100 - lostPct;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Gift size={ms(16)} color={palette.goldLight} strokeWidth={2} />
          <Text style={[styles.title, { fontFamily: fonts.semibold }]}>{t('luckyWheel.prizesTitle')}</Text>
        </View>
        <View style={styles.ratePill}>
          <Text style={[styles.rateText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.winRate', { rate: winPct })}</Text>
        </View>
      </View>

      {prizes.map((p, i) => (
        <View key={p.id ?? i} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: prizeColor(i) }]} />
          <View style={styles.rowBody}>
            <Text style={[styles.label, { fontFamily: fonts.medium }]} numberOfLines={1}>{p.label}</Text>
            {!!p.description && (
              <Text style={[styles.desc, { fontFamily: fonts.regular }]} numberOfLines={1}>{p.description}</Text>
            )}
          </View>
          <Text style={[styles.pct, { fontFamily: fonts.semibold }]}>{`${perPrize[i]}%`}</Text>
        </View>
      ))}

      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: LOST_COLOR }]} />
        <View style={styles.rowBody}>
          <Text style={[styles.label, styles.muted, { fontFamily: fonts.medium }]} numberOfLines={1}>
            {t('luckyWheel.lostShort')}
          </Text>
        </View>
        <Text style={[styles.pct, styles.muted, { fontFamily: fonts.semibold }]}>{`${lostPct}%`}</Text>
      </View>

      <Text style={[styles.hint, { fontFamily: fonts.regular }]}>{t('luckyWheel.oddsHint')}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: radius.xl,
    paddingHorizontal: ms(16),
    paddingTop: ms(14),
    paddingBottom: ms(12),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ms(8), marginBottom: hp(6) },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: ms(8), flexShrink: 1 },
  title: { color: '#fff', fontSize: FS.md },
  ratePill: {
    paddingHorizontal: ms(10),
    paddingVertical: ms(4),
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.14)',
  },
  rateText: { color: palette.goldLight, fontSize: FS.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: ms(12), paddingVertical: hp(8) },
  dot: { width: ms(10), height: ms(10), borderRadius: ms(5) },
  rowBody: { flex: 1 },
  label: { color: '#fff', fontSize: FS.sm },
  desc: { color: 'rgba(255,255,255,0.5)', fontSize: FS.xs, marginTop: hp(1) },
  pct: { color: '#fff', fontSize: FS.sm },
  muted: { color: 'rgba(255,255,255,0.55)' },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: FS.xs, marginTop: hp(4) },
});
