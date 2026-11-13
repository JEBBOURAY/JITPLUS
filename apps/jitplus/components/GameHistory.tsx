// History list shared by the lucky wheel and the scratch cards, on their dark
// stage: an empty state, titled groups, and one row per draw or card.
import React, { type ReactNode } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Clock, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { AppFonts } from '@/utils/fonts';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';
import MerchantLogo from './MerchantLogo';

/** Pill colours by outcome, shared by both games. */
export const HISTORY_TONES = {
  pending: { color: '#FBBF24', bg: 'rgba(251,191,36,0.14)' },
  success: { color: '#34D399', bg: 'rgba(16,185,129,0.14)' },
  failed: { color: '#F87171', bg: 'rgba(239,68,68,0.14)' },
  muted: { color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.08)' },
} as const;

export type HistoryTone = (typeof HISTORY_TONES)[keyof typeof HISTORY_TONES];

export function GameHistoryEmpty({ title, hint, fonts }: { title: string; hint: string; fonts: AppFonts }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Clock size={ms(30)} color="rgba(255,255,255,0.7)" strokeWidth={1.6} />
      </View>
      <Text style={[styles.emptyTitle, { fontFamily: fonts.bold }]}>{title}</Text>
      <Text style={[styles.emptyHint, { fontFamily: fonts.regular }]}>{hint}</Text>
    </View>
  );
}

interface RowProps {
  logoUrl?: string | null;
  merchant: string;
  title: string;
  date: string;
  /** Gold line under the date ("À récupérer avant le…"). */
  deadline?: string | null;
  statusLabel: string;
  tone: HistoryTone;
  /** A gain: full-opacity title and a badge on the logo. */
  won: boolean;
  BadgeIcon: LucideIcon;
  /** Still to collect or to use. */
  highlighted: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  fonts: AppFonts;
}

export function GameHistoryRow({
  logoUrl, merchant, title, date, deadline, statusLabel, tone, won, BadgeIcon, highlighted,
  accessibilityLabel, onPress, fonts,
}: RowProps) {
  const content = (
    <>
      <View style={styles.logoWrap}>
        <MerchantLogo logoUrl={logoUrl} merchantName={merchant} style={styles.logo} />
        {won && (
          <View style={styles.badgeDot}>
            <BadgeIcon size={ms(10)} color="#fff" strokeWidth={2.4} />
          </View>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { fontFamily: fonts.semibold, opacity: won ? 1 : 0.7 }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.rowMeta, { fontFamily: fonts.regular }]} numberOfLines={1}>
          {merchant ? `${merchant} · ${date}` : date}
        </Text>
        {deadline && (
          <Text style={[styles.rowDeadline, { fontFamily: fonts.medium }]} numberOfLines={1}>{deadline}</Text>
        )}
      </View>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pillText, { color: tone.color, fontFamily: fonts.semibold }]}>{statusLabel}</Text>
      </View>
    </>
  );

  const rowStyle = [styles.row, highlighted && styles.rowHighlight];
  return onPress ? (
    <TouchableOpacity
      style={rowStyle}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </TouchableOpacity>
  ) : (
    <View style={rowStyle} accessible accessibilityLabel={accessibilityLabel}>
      {content}
    </View>
  );
}

interface ListProps {
  /** Groups in display order; a group without rows is skipped. */
  sections: { title: string; hint?: string; rows: ReactNode[] }[];
  bottomInset: number;
  fonts: AppFonts;
}

export function GameHistoryList({ sections, bottomInset, fonts }: ListProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset + hp(24) }}
      showsVerticalScrollIndicator={false}
    >
      {sections.map((section) => section.rows.length > 0 && (
        <React.Fragment key={section.title}>
          <Text style={[styles.section, { fontFamily: fonts.semibold }]}>{section.title}</Text>
          {section.hint ? (
            <Text style={[styles.sectionHint, { fontFamily: fonts.regular }]}>{section.hint}</Text>
          ) : null}
          <View style={styles.group}>{section.rows}</View>
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, alignSelf: 'stretch' },
  section: {
    color: 'rgba(255,255,255,0.9)', fontSize: FS.sm,
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
  badgeDot: {
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
