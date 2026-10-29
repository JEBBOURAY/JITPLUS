import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Clock, Gift } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { formatDate } from '@/utils/date';
import { getScratchEntryStatus, type ScratchEntryStatus } from '@/utils/scratchHistory';
import { formatRewardValue } from '@jitplus/shared/src/scratch';
import type { ScratchCardDto } from '@jitplus/shared/src/scratch';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';
import MerchantLogo from '../MerchantLogo';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  toUse: ScratchCardDto[];
  past: ScratchCardDto[];
  locale: string;
  bottomInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpen: (card: ScratchCardDto) => void;
}

const STATUS_STYLE: Record<Exclude<ScratchEntryStatus, 'pending'>, { color: string; bg: string }> = {
  toUse: { color: '#FBBF24', bg: 'rgba(251,191,36,0.14)' },
  used: { color: '#34D399', bg: 'rgba(16,185,129,0.14)' },
  expired: { color: '#F87171', bg: 'rgba(239,68,68,0.14)' },
  cancelled: { color: '#F87171', bg: 'rgba(239,68,68,0.14)' },
  missed: { color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.08)' },
};

/** Scratch card history on the dark stage: gifts to use first, then past cards. */
export default React.memo(function ScratchHistory({ toUse, past, locale, bottomInset, fonts, t, onOpen }: Props) {
  if (!toUse.length && !past.length) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Clock size={ms(30)} color="rgba(255,255,255,0.7)" strokeWidth={1.6} />
        </View>
        <Text style={[styles.emptyTitle, { fontFamily: fonts.bold }]}>{t('scratch.hub.noHistory')}</Text>
        <Text style={[styles.emptyHint, { fontFamily: fonts.regular }]}>{t('scratch.hub.noHistoryHint')}</Text>
      </View>
    );
  }

  const renderRow = (card: ScratchCardDto) => {
    const status = getScratchEntryStatus(card);
    if (status === 'pending') return null;
    const s = STATUS_STYLE[status];
    const coupon = card.coupon;
    const merchant = card.merchant.nom || card.campaign.name;
    const title = coupon
      ? formatRewardValue({ type: coupon.type, value: coupon.value, label: coupon.label }, t)
      : t('scratch.hub.missed');
    const dateStr = formatDate(card.scratchedAt ?? card.expiresAt, locale);
    const statusLabel = status === 'missed' && card.status === 'CANCELLED'
      ? t('scratch.hub.status.missedCancelled')
      : t(`scratch.hub.status.${status}`);
    const deadline = status === 'toUse' && coupon
      ? t('scratch.conditions.expiresAt', { date: formatDate(coupon.expiresAt, locale) })
      : null;

    const content = (
      <>
        <View style={styles.logoWrap}>
          <MerchantLogo logoUrl={card.merchant.logoUrl} merchantName={merchant} style={styles.logo} />
          {!!coupon && (
            <View style={styles.giftDot}>
              <Gift size={ms(10)} color="#fff" strokeWidth={2.4} />
            </View>
          )}
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { fontFamily: fonts.semibold, opacity: coupon ? 1 : 0.7 }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.rowMeta, { fontFamily: fonts.regular }]} numberOfLines={1}>
            {merchant ? `${merchant} · ${dateStr}` : dateStr}
          </Text>
          {deadline && (
            <Text style={[styles.rowDeadline, { fontFamily: fonts.medium }]} numberOfLines={1}>{deadline}</Text>
          )}
        </View>
        <View style={[styles.pill, { backgroundColor: s.bg }]}>
          <Text style={[styles.pillText, { color: s.color, fontFamily: fonts.semibold }]}>{statusLabel}</Text>
        </View>
      </>
    );

    const rowStyle = [styles.row, status === 'toUse' && styles.rowHighlight];
    const a11yLabel = t('scratch.hub.itemA11y', { title, merchant, status: statusLabel });
    return coupon ? (
      <TouchableOpacity
        key={card.id}
        style={rowStyle}
        onPress={() => onOpen(card)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        {content}
      </TouchableOpacity>
    ) : (
      <View key={card.id} style={rowStyle} accessible accessibilityLabel={a11yLabel}>
        {content}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset + hp(24) }}
      showsVerticalScrollIndicator={false}
    >
      {toUse.length > 0 && (
        <>
          <Text style={[styles.section, { fontFamily: fonts.semibold }]}>
            {t('scratch.hub.toUse', { count: toUse.length })}
          </Text>
          <Text style={[styles.sectionHint, { fontFamily: fonts.regular }]}>{t('scratch.hub.toUseHint')}</Text>
          <View style={styles.group}>{toUse.map(renderRow)}</View>
        </>
      )}
      {past.length > 0 && (
        <>
          <Text style={[styles.section, { fontFamily: fonts.semibold }]}>{t('scratch.hub.past')}</Text>
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
  giftDot: {
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
