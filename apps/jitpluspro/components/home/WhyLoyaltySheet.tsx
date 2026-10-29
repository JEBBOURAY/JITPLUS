import React from 'react';
import { View, Text, StyleSheet, I18nManager } from 'react-native';
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
import PromoSheet, { SheetSectionLabel, useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import ZelligePattern from '@/components/home/ZelligePattern';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

// Same terracotta + zellige as the "Comprendre" promo banner that opens this sheet.
const TONE: PromoTone = 'orange';
const ACCENT = PROMO_TONES[TONE].fill;

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
  return (
    <View style={styles.barRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.barLabelRow}>
        <Text style={[styles.barLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <Text style={[styles.barValue, { color: ink(tone) }]} maxFontSizeMultiplier={1.2}>
          {value}
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)' }]}>
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
  const isRTL = I18nManager.isRTL;
  const accentInk = ink(TONE);
  const cardStyle = [styles.card, { backgroundColor: softFill, borderColor: hairline }];

  const steps: { Icon: LucideIcon; title: string; text: string }[] = [
    { Icon: ShoppingBag, title: t('home.whyCycleStep1Title'), text: t('home.whyCycleStep1Text') },
    { Icon: JitScan, title: t('home.whyCycleStep2Title'), text: t('home.whyCycleStep2Text') },
    { Icon: JitGift, title: t('home.whyCycleStep3Title'), text: t('home.whyCycleStep3Text') },
    { Icon: RotateCcw, title: t('home.whyCycleStep4Title'), text: t('home.whyCycleStep4Text') },
  ];

  const benefits: { Icon: LucideIcon; tone: PromoTone; title: string; text: string }[] = [
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
      <View style={cardStyle}>
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <View key={i} style={[styles.stepRow, isRTL && styles.rowRtl]}>
              <View style={styles.stepRail}>
                <View style={[styles.stepDot, last && styles.stepDotLast]}>
                  {last ? (
                    <step.Icon size={15} color="#FFFFFF" strokeWidth={2.2} />
                  ) : (
                    <Text style={[styles.stepDotText, { color: accentInk }]} maxFontSizeMultiplier={1.1}>{i + 1}</Text>
                  )}
                </View>
                {!last ? <View style={styles.stepConnector} /> : null}
              </View>
              <View style={styles.stepBody}>
                <View style={[styles.stepTitleRow, isRTL && styles.rowRtl]}>
                  <step.Icon size={15} color={accentInk} strokeWidth={2} />
                  <Text style={[styles.stepTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                    {step.title}
                  </Text>
                </View>
                <Text style={[styles.stepText, { color: muted }]} maxFontSizeMultiplier={1.4}>
                  {step.text}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── 3. Pourquoi au Maroc ── */}
      <SheetSectionLabel text={t('home.whyMoroccoLabel')} tone={TONE} />
      <View style={[styles.callout, isRTL && styles.rowRtl]}>
        <View style={styles.calloutIcon}>
          <JitStore size={17} color={accentInk} strokeWidth={2} />
        </View>
        <Text style={[styles.calloutText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.45}>
          {t('home.whyCompetitionText')}
        </Text>
      </View>

      {/* ── 4. Ce que ça change ── */}
      <SheetSectionLabel text={t('home.whyBenefitsLabel')} tone={TONE} />
      <View style={[cardStyle, styles.benefitsCard]}>
        {benefits.map((b, i) => (
          <View
            key={i}
            style={[
              styles.benefitRow,
              isRTL && styles.rowRtl,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline },
            ]}
          >
            <View style={[styles.benefitIcon, { backgroundColor: `${PROMO_TONES[b.tone].fill}1A` }]}>
              <b.Icon size={16} color={ink(b.tone)} strokeWidth={2} />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.benefitTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                {b.title}
              </Text>
              <Text style={[styles.benefitText, { color: muted }]} maxFontSizeMultiplier={1.45}>
                {b.text}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </PromoSheet>
  );
}

export default React.memo(WhyLoyaltySheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  flex1: { flex: 1 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },

  // Constat
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricValue: { fontSize: 34, fontFamily: 'Lexend_700Bold', letterSpacing: -0.5 },
  metricText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_500Medium' },
  barsBlock: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  barRow: { gap: 5 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  barLabel: { fontSize: 12.5, fontFamily: 'Lexend_500Medium' },
  barValue: { fontSize: 13, fontFamily: 'Lexend_700Bold' },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  barCaption: { fontSize: 10.5, fontFamily: 'Lexend_400Regular', textAlign: 'center' },

  // Cycle
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 26 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: `${ACCENT}1A`,
    borderWidth: 1.5,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotLast: { backgroundColor: ACCENT },
  stepDotText: { fontSize: 12, fontFamily: 'Lexend_700Bold' },
  stepConnector: { flex: 1, width: 2, backgroundColor: `${ACCENT}33`, marginVertical: 3 },
  stepBody: { flex: 1, paddingBottom: 14 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepTitle: { fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },
  stepText: { fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // Maroc callout
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    backgroundColor: `${ACCENT}12`,
    borderColor: `${ACCENT}30`,
  },
  calloutIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}1F`,
  },
  calloutText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_400Regular' },

  // Benefits
  benefitsCard: { paddingVertical: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 11 },
  benefitIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  benefitTitle: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  benefitText: { fontSize: 11.5, lineHeight: 16.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },
});
