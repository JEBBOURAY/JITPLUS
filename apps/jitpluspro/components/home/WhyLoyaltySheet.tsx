import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import {
  ShoppingBag,
  RotateCcw,
  Repeat,
  ShoppingBasket,
  Leaf,
} from 'lucide-react-native';
import {
  JitGift,
  JitMessages,
  JitScan,
  JitStamp,
  JitStore,
} from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import PromoSheet, { SheetSectionLabel, useSheetColors } from '@/components/home/PromoSheet';
import { SheetCallout, SheetIconList, SheetSteps, type SheetItem } from '@/components/home/SheetBlocks';
import ZelligePattern from '@/components/home/ZelligePattern';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

// Same terracotta + zellige as the "Comprendre" promo banner that opens this sheet.
const TONE: PromoTone = 'orange';

interface WhyLoyaltySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Primary CTA ("set up my stamp card"). Omitted when the user cannot open the settings. */
  onConfigure?: () => void;
}

/** One horizontal bar of the cost-comparison schema. */
function CostBar({ label, value, ratio, tone }: { label: string; value: string; ratio: number; tone: PromoTone }) {
  const theme = useTheme();
  const { ink } = useSheetColors();
  const { isRTL } = useDir();
  return (
    <View style={styles.barRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.barLabelRow, isRTL && styles.rowRtl]}>
        <Text style={[styles.barLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <Text style={[styles.barValue, { color: ink(tone) }]} maxFontSizeMultiplier={1.2}>
          {value}
        </Text>
      </View>
      <View style={[styles.barTrack, isRTL && styles.barTrackRtl, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)' }]}>
        <View style={[styles.barFill, { backgroundColor: PROMO_TONES[tone].fill, width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </View>
  );
}

/**
 * "Why loyalty in Morocco" article sheet opened from the Accueil promo card.
 * Structured like a mini-article: hero, cost-comparison schema, the virtuous
 * cycle in 4 steps, a Morocco-specific callout, then concrete benefits and a
 * CTA to configure the stamp card.
 */
function WhyLoyaltySheet({ visible, onClose, onConfigure }: WhyLoyaltySheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const { isRTL } = useDir();
  const accentInk = ink(TONE);
  const cardStyle = [styles.card, { backgroundColor: softFill, borderColor: hairline }];

  const steps: SheetItem[] = [
    { Icon: ShoppingBag, title: t('home.whyCycleStep1Title'), text: t('home.whyCycleStep1Text') },
    { Icon: JitScan, title: t('home.whyCycleStep2Title'), text: t('home.whyCycleStep2Text') },
    { Icon: JitGift, title: t('home.whyCycleStep3Title'), text: t('home.whyCycleStep3Text') },
    { Icon: RotateCcw, title: t('home.whyCycleStep4Title'), text: t('home.whyCycleStep4Text') },
  ];

  const benefits: SheetItem[] = [
    { Icon: Repeat, tone: 'violet', title: t('home.whyBenefit1Title'), text: t('home.whyBenefit1Text') },
    { Icon: ShoppingBasket, tone: 'blue', title: t('home.whyBenefit2Title'), text: t('home.whyBenefit2Text') },
    { Icon: JitMessages, tone: 'amber', title: t('home.whyBenefit3Title'), text: t('home.whyBenefit3Text') },
    { Icon: Leaf, tone: 'emerald', title: t('home.whyBenefit4Title'), text: t('home.whyBenefit4Text') },
  ];

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.whyHeroLabel')}
      title={t('home.tipWhyTitle')}
      subtitle={t('home.whyHeroSubtitle')}
      heroBackground={<ZelligePattern cells={24} spacing={12} />}
      cta={onConfigure ? { label: t('home.whyCta'), Icon: JitStamp, onPress: onConfigure } : undefined}
      showClose={false}
    >
      {/* ── 1. Le constat : schéma comparatif ── */}
      <SheetSectionLabel text={t('home.whyConstatLabel')} tone={TONE} />
      <View style={cardStyle}>
        <View style={[styles.metricRow, isRTL && styles.rowRtl]}>
          <Text style={[styles.metricValue, { color: accentInk }]} maxFontSizeMultiplier={1.1}>
            {t('home.whyMetricValue')}
          </Text>
          <Text style={[styles.metricText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {t('home.whyMetricText')}
          </Text>
        </View>
        <View style={[styles.barsBlock, { borderTopColor: hairline }]}>
          <CostBar label={t('home.whyBarAcquire')} value={t('home.whyBarAcquireValue')} ratio={1} tone="red" />
          <CostBar label={t('home.whyBarKeep')} value={t('home.whyBarKeepValue')} ratio={0.2} tone="emerald" />
          <Text style={[styles.barCaption, { color: muted }]} maxFontSizeMultiplier={1.3}>
            {t('home.whyBarCaption')}
          </Text>
        </View>
      </View>

      {/* ── 2. Le cercle vertueux : schéma en 4 étapes ── */}
      <SheetSectionLabel text={t('home.whyCycleLabel')} tone={TONE} />
      <SheetSteps steps={steps} tone={TONE} lastFilled />

      {/* ── 3. Pourquoi au Maroc ── */}
      <SheetSectionLabel text={t('home.whyMoroccoLabel')} tone={TONE} />
      <SheetCallout Icon={JitStore} tone={TONE} lines={[t('home.whyCompetitionText')]} />

      {/* ── 4. Ce que ça change ── */}
      <SheetSectionLabel text={t('home.whyBenefitsLabel')} tone={TONE} />
      <SheetIconList items={benefits} tone={TONE} />
    </PromoSheet>
  );
}

export default React.memo(WhyLoyaltySheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },

  // Constat
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricValue: { fontSize: 34, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.5 },
  metricText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_500Medium' },
  barsBlock: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  barRow: { gap: 5 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  barLabel: { fontSize: 12.5, fontFamily: 'Lexend_500Medium' },
  barValue: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  barCaption: { fontSize: 10.5, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
  barTrackRtl: { alignItems: 'flex-end' },
});
