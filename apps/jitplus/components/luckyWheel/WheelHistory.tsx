import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Clock, Trophy } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import type { LuckyWheelDraw } from '@/types';
import { getDrawStatus, type DrawStatus } from '@/utils/luckyWheel';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';
import MerchantLogo from '../MerchantLogo';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  draws: LuckyWheelDraw[];
  loading: boolean;
  localeTag: string;
  bottomInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const STATUS_STYLE: Record<DrawStatus, { color: string; bg: string; key: string }> = {
  pending: { color: '#FBBF24', bg: 'rgba(251,191,36,0.14)', key: 'luckyWheel.pending' },
  claimed: { color: '#34D399', bg: 'rgba(16,185,129,0.14)', key: 'luckyWheel.claimed' },
  expired: { color: '#F87171', bg: 'rgba(239,68,68,0.14)', key: 'luckyWheel.expired' },
  lost: { color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.08)', key: 'luckyWheel.lost' },
};

/** Draw history on the wheel's dark stage: prizes to collect first, then past draws. */
export default React.memo(function WheelHistory({ draws, loading, localeTag, bottomInset, fonts, t }: Props) {
  const { toCollect, past } = useMemo(() => {
    const now = new Date();
    const collect: LuckyWheelDraw[] = [];
    const rest: LuckyWheelDraw[] = [];
    for (const d of draws) (getDrawStatus(d, now) === 'pending' ? collect : rest).push(d);
    return { toCollect: collect, past: rest };
  }, [draws]);

  if (loading) {
    return <ActivityIndicator color={palette.goldLight} style={{ marginTop: hp(48) }} />;
  }

  if (!draws.length) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Clock size={ms(30)} color="rgba(255,255,255,0.7)" strokeWidth={1.6} />
        </View>
        <Text style={[styles.emptyTitle, { fontFamily: fonts.bold }]}>{t('luckyWheel.noHistory')}</Text>
        <Text style={[styles.emptyHint, { fontFamily: fonts.regular }]}>{t('luckyWheel.noHistoryHint')}</Text>
      </View>
    );
  }

  const formatDate = (iso: string, withYear = true) =>
    new Date(iso).toLocaleDateString(localeTag, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

  const renderRow = (draw: LuckyWheelDraw) => {
    const status = getDrawStatus(draw);
    const s = STATUS_STYLE[status];
    const won = draw.result === 'WON';
    const merchant = draw.ticket?.campaign?.merchant?.nom ?? draw.ticket?.campaign?.name ?? '';
    const title = won ? (draw.prize?.label ?? t('luckyWheel.won')) : t('luckyWheel.lostShort');
    const dateStr = formatDate(draw.createdAt);
    const deadline = status === 'pending' && draw.claimBefore
      ? t('luckyWheel.claimBefore', { date: formatDate(draw.claimBefore, false) })
      : null;
    return (
      <View
        key={draw.id}
        style={[styles.row, status === 'pending' && styles.rowHighlight]}
        accessible
        accessibilityLabel={t('luckyWheel.historyItemA11y', {
          result: title,
          merchant,
          campaign: draw.ticket?.campaign?.name ?? '',
          date: dateStr,
        })}
      >
        <View style={styles.logoWrap}>
          <MerchantLogo logoUrl={draw.ticket?.campaign?.merchant?.logoUrl} merchantName={merchant} style={styles.logo} />
          {won && (
            <View style={styles.trophyDot}>
              <Trophy size={ms(10)} color="#fff" strokeWidth={2.4} />
            </View>
          )}
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { fontFamily: fonts.semibold, opacity: won ? 1 : 0.7 }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.rowMeta, { fontFamily: fonts.regular }]} numberOfLines={1}>
            {merchant ? `${merchant} · ${dateStr}` : dateStr}
          </Text>
          {deadline && (
            <Text style={[styles.rowDeadline, { fontFamily: fonts.medium }]} numberOfLines={1}>{deadline}</Text>
          )}
        </View>
        <View style={[styles.pill, { backgroundColor: s.bg }]}>
          <Text style={[styles.pillText, { color: s.color, fontFamily: fonts.semibold }]}>{t(s.key)}</Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset + hp(24) }}
      showsVerticalScrollIndicator={false}
    >
      {toCollect.length > 0 && (
        <>
          <Text style={[styles.section, { fontFamily: fonts.semibold }]}>
            {t('luckyWheel.toCollect', { count: toCollect.length })}
          </Text>
          <Text style={[styles.sectionHint, { fontFamily: fonts.regular }]}>{t('luckyWheel.toCollectHint')}</Text>
          <View style={styles.group}>{toCollect.map(renderRow)}</View>
        </>
      )}
      {past.length > 0 && (
        <>
          <Text style={[styles.section, { fontFamily: fonts.semibold }]}>{t('luckyWheel.pastDraws')}</Text>
          <View style={styles.group}>{past.map(renderRow)}</View>
        </>
      )}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { flex: 1, alignSelf: 'stretch' },
  section: {
    color: 'rgba(255,255,255,0.9)', fontSize: FS.sm, letterSpacing: 0.4, textTransform: 'uppercase',
    marginTop: hp(18), marginBottom: hp(4), paddingHorizontal: wp(20),
  },
  sectionHint: { color: 'rgba(255,255,255,0.55)', fontSize: FS.xs, paddingHorizontal: wp(20), marginBottom: hp(6) },
  group: {
    marginHorizontal: wp(16), marginTop: hp(6), borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: ms(12), paddingHorizontal: ms(14), paddingVertical: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowHighlight: { backgroundColor: 'rgba(251,191,36,0.06)' },
  logoWrap: { width: ms(42), height: ms(42) },
  logo: { width: ms(42), height: ms(42), borderRadius: ms(12), backgroundColor: '#fff' },
  trophyDot: {
    position: 'absolute', right: -ms(4), bottom: -ms(4), width: ms(20), height: ms(20), borderRadius: ms(10),
    backgroundColor: palette.goldDark, borderWidth: 2, borderColor: '#1A0B33', alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: hp(2) },
  rowTitle: { color: '#fff', fontSize: FS.md },
  rowMeta: { color: 'rgba(255,255,255,0.55)', fontSize: FS.xs },
  rowDeadline: { color: palette.goldLight, fontSize: FS.xs, marginTop: hp(1) },
  pill: { paddingHorizontal: ms(10), paddingVertical: ms(4), borderRadius: 999 },
  pillText: { fontSize: FS.xs },
  empty: { alignItems: 'center', paddingTop: hp(70), paddingHorizontal: wp(36), gap: hp(10) },
  emptyIcon: {
    width: ms(68), height: ms(68), borderRadius: ms(34), alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: hp(6),
  },
  emptyTitle: { color: '#fff', fontSize: FS.lg, textAlign: 'center' },
  emptyHint: { color: 'rgba(255,255,255,0.6)', fontSize: FS.sm, textAlign: 'center', lineHeight: ms(20) },
});
