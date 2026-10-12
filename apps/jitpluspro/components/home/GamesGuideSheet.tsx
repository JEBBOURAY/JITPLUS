import React from 'react';
import { View, Text, StyleSheet, I18nManager } from 'react-native';
import {
  FerrisWheel,
  Ticket,
  Gift,
  ScanLine,
  Trophy,
  Users,
  BellRing,
  Repeat,
  ShoppingBasket,
  PartyPopper,
  Lightbulb,
  ShieldCheck,
  BarChart3,
  Sparkles,
  Gamepad2,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PromoSheet, { SheetSectionLabel, useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

// Same tone as the promo banner that opens this sheet.
const TONE: PromoTone = 'pink';
const WHEEL: PromoTone = 'pink';
const SCRATCH: PromoTone = 'amber';
const ACCENT = PROMO_TONES[TONE].fill;

type Pick = 'wheel' | 'scratch' | 'both';

interface GamesGuideSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Primary CTA: opens the games hub (lucky wheel + scratch cards). */
  onStart: () => void;
}

interface Step {
  Icon: LucideIcon;
  title: string;
  text: string;
}

interface Benefit {
  Icon: LucideIcon;
  title: string;
  text: string;
}

/** Numbered 3-step "how it works" timeline, in the colour of one game. */
function StepsCard({ steps, tone }: { steps: Step[]; tone: PromoTone }) {
  const theme = useTheme();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const isRTL = I18nManager.isRTL;
  const fill = PROMO_TONES[tone].fill;
  const toneInk = ink(tone);

  return (
    <View style={[styles.card, { backgroundColor: softFill, borderColor: hairline }]}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={i} style={[styles.stepRow, isRTL && styles.rowRtl]}>
            <View style={styles.stepRail}>
              <View style={[styles.stepDot, { backgroundColor: `${fill}1A`, borderColor: fill }]}>
                <Text style={[styles.stepDotText, { color: toneInk }]} maxFontSizeMultiplier={1.1}>
                  {i + 1}
                </Text>
              </View>
              {!last ? <View style={[styles.stepConnector, { backgroundColor: `${fill}33` }]} /> : null}
            </View>
            <View style={[styles.stepBody, last && styles.stepBodyLast]}>
              <View style={[styles.stepTitleRow, isRTL && styles.rowRtl]}>
                <step.Icon size={15} color={toneInk} strokeWidth={2} />
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
  );
}

/** Icon + title + text list of what a game brings to the merchant. */
function BenefitsCard({ benefits, tone }: { benefits: Benefit[]; tone: PromoTone }) {
  const theme = useTheme();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const isRTL = I18nManager.isRTL;

  return (
    <View style={[styles.listCard, { backgroundColor: softFill, borderColor: hairline }]}>
      {benefits.map((b, i) => (
        <View
          key={i}
          style={[
            styles.row,
            isRTL && styles.rowRtl,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline },
          ]}
        >
          <View style={[styles.benefitIcon, { backgroundColor: `${PROMO_TONES[tone].fill}1A` }]}>
            <b.Icon size={16} color={ink(tone)} strokeWidth={2} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
              {b.title}
            </Text>
            <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.45}>
              {b.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Accueil guide comparing the two games (lucky wheel and scratch card): what
 * each one is for, how it works in 3 steps, what it brings, which one to pick
 * for a given goal, and a CTA to launch a first game.
 */
function GamesGuideSheet({ visible, onClose, onStart }: GamesGuideSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const isRTL = I18nManager.isRTL;

  const games: { tone: PromoTone; Icon: LucideIcon; name: string; tagline: string; text: string; tags: string }[] = [
    {
      tone: WHEEL,
      Icon: FerrisWheel,
      name: t('home.gamesGuideWheelName'),
      tagline: t('home.gamesGuideWheelTagline'),
      text: t('home.gamesGuideWheelText'),
      tags: t('home.gamesGuideWheelTags'),
    },
    {
      tone: SCRATCH,
      Icon: Ticket,
      name: t('home.gamesGuideScratchName'),
      tagline: t('home.gamesGuideScratchTagline'),
      text: t('home.gamesGuideScratchText'),
      tags: t('home.gamesGuideScratchTags'),
    },
  ];

  const wheelSteps: Step[] = [
    { Icon: FerrisWheel, title: t('home.gamesGuideWheelStep1Title'), text: t('home.gamesGuideWheelStep1Text') },
    { Icon: ScanLine, title: t('home.gamesGuideWheelStep2Title'), text: t('home.gamesGuideWheelStep2Text') },
    { Icon: Trophy, title: t('home.gamesGuideWheelStep3Title'), text: t('home.gamesGuideWheelStep3Text') },
  ];

  const wheelBenefits: Benefit[] = [
    { Icon: Repeat, title: t('home.gamesGuideWheelBenefit1Title'), text: t('home.gamesGuideWheelBenefit1Text') },
    { Icon: ShoppingBasket, title: t('home.gamesGuideWheelBenefit2Title'), text: t('home.gamesGuideWheelBenefit2Text') },
    { Icon: PartyPopper, title: t('home.gamesGuideWheelBenefit3Title'), text: t('home.gamesGuideWheelBenefit3Text') },
  ];

  const scratchSteps: Step[] = [
    { Icon: Gift, title: t('home.gamesGuideScratchStep1Title'), text: t('home.gamesGuideScratchStep1Text') },
    { Icon: Users, title: t('home.gamesGuideScratchStep2Title'), text: t('home.gamesGuideScratchStep2Text') },
    { Icon: ScanLine, title: t('home.gamesGuideScratchStep3Title'), text: t('home.gamesGuideScratchStep3Text') },
  ];

  const scratchBenefits: Benefit[] = [
    { Icon: BellRing, title: t('home.gamesGuideScratchBenefit1Title'), text: t('home.gamesGuideScratchBenefit1Text') },
    { Icon: ShieldCheck, title: t('home.gamesGuideScratchBenefit2Title'), text: t('home.gamesGuideScratchBenefit2Text') },
    { Icon: BarChart3, title: t('home.gamesGuideScratchBenefit3Title'), text: t('home.gamesGuideScratchBenefit3Text') },
  ];

  const picks: { goal: string; pick: Pick }[] = [
    { goal: t('home.gamesGuideChoice1'), pick: 'wheel' },
    { goal: t('home.gamesGuideChoice2'), pick: 'wheel' },
    { goal: t('home.gamesGuideChoice3'), pick: 'scratch' },
    { goal: t('home.gamesGuideChoice4'), pick: 'scratch' },
    { goal: t('home.gamesGuideChoice5'), pick: 'both' },
  ];

  const pickLabel: Record<Pick, string> = {
    wheel: t('home.gamesGuidePickWheel'),
    scratch: t('home.gamesGuidePickScratch'),
    both: t('home.gamesGuidePickBoth'),
  };
  const pickTone: Record<Pick, PromoTone> = { wheel: WHEEL, scratch: SCRATCH, both: 'violet' };

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.gamesGuideHeroLabel')}
      title={t('home.gamesGuideTitle')}
      subtitle={t('home.gamesGuideSubtitle')}
      heroBadge={<Gamepad2 size={22} color={ACCENT} strokeWidth={2} />}
      cta={{ label: t('home.gamesGuideCta'), Icon: Sparkles, onPress: onStart }}
    >
      {/* ── 1. Les deux jeux en un coup d'œil ── */}
      <SheetSectionLabel text={t('home.gamesGuideCompareLabel')} tone={TONE} />
      <View style={[styles.gamesRow, isRTL && styles.rowRtl]}>
        {games.map((g) => {
          const fill = PROMO_TONES[g.tone].fill;
          const toneInk = ink(g.tone);
          return (
            <View key={g.name} style={[styles.gameCard, { backgroundColor: `${fill}10`, borderColor: `${fill}55` }]}>
              <View style={[styles.gameIcon, { backgroundColor: `${fill}1F` }]}>
                <g.Icon size={18} color={toneInk} strokeWidth={2} />
              </View>
              <Text style={[styles.gameName, { color: toneInk }]} maxFontSizeMultiplier={1.2}>
                {g.name.toUpperCase()}
              </Text>
              <Text style={[styles.gameTagline, { color: theme.text }]} maxFontSizeMultiplier={1.25}>
                {g.tagline}
              </Text>
              <Text style={[styles.gameText, { color: muted }]} maxFontSizeMultiplier={1.4}>
                {g.text}
              </Text>
              <Text style={[styles.gameTags, { color: toneInk }]} maxFontSizeMultiplier={1.25}>
                {g.tags}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── 2. La roue de la chance ── */}
      <SheetSectionLabel text={t('home.gamesGuideWheelStepsLabel')} tone={WHEEL} Icon={FerrisWheel} />
      <StepsCard steps={wheelSteps} tone={WHEEL} />
      <SheetSectionLabel text={t('home.gamesGuideWheelBenefitsLabel')} tone={WHEEL} />
      <BenefitsCard benefits={wheelBenefits} tone={WHEEL} />

      {/* ── 3. La carte à gratter ── */}
      <SheetSectionLabel text={t('home.gamesGuideScratchStepsLabel')} tone={SCRATCH} Icon={Ticket} />
      <StepsCard steps={scratchSteps} tone={SCRATCH} />
      <SheetSectionLabel text={t('home.gamesGuideScratchBenefitsLabel')} tone={SCRATCH} />
      <BenefitsCard benefits={scratchBenefits} tone={SCRATCH} />

      {/* ── 4. Lequel choisir ? ── */}
      <SheetSectionLabel text={t('home.gamesGuideChoiceLabel')} tone={TONE} />
      <View style={[styles.listCard, { backgroundColor: softFill, borderColor: hairline }]}>
        {picks.map((p, i) => {
          const tone = pickTone[p.pick];
          return (
            <View
              key={i}
              style={[
                styles.pickRow,
                isRTL && styles.rowRtl,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline },
              ]}
              accessible
              accessibilityLabel={`${p.goal} : ${pickLabel[p.pick]}`}
            >
              <Text style={[styles.pickGoal, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
                {p.goal}
              </Text>
              <View style={[styles.pickBadge, { backgroundColor: `${PROMO_TONES[tone].fill}1A` }]}>
                <Text style={[styles.pickBadgeText, { color: ink(tone) }]} maxFontSizeMultiplier={1.2}>
                  {pickLabel[p.pick]}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── 5. Le combo gagnant ── */}
      <View style={[styles.callout, isRTL && styles.rowRtl]}>
        <View style={styles.calloutIcon}>
          <Lightbulb size={17} color={ink(TONE)} strokeWidth={2} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.calloutTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
            {t('home.gamesGuideComboTitle')}
          </Text>
          <Text style={[styles.calloutText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.45}>
            {t('home.gamesGuideComboText')}
          </Text>
        </View>
      </View>

      <Text style={[styles.hint, { color: muted }]} maxFontSizeMultiplier={1.3}>
        {t('home.gamesGuideHint')}
      </Text>
    </PromoSheet>
  );
}

export default React.memo(GamesGuideSheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  flex1: { flex: 1 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },

  // Games comparison
  gamesRow: { flexDirection: 'row', gap: 10 },
  gameCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
  gameIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gameName: { fontSize: 9.5, letterSpacing: 0.9, fontFamily: 'Lexend_700Bold' },
  gameTagline: { fontSize: 13.5, lineHeight: 18, fontFamily: 'Lexend_700Bold', marginTop: 3 },
  gameText: { fontSize: 11.5, lineHeight: 16, marginTop: 5, fontFamily: 'Lexend_400Regular' },
  gameTags: { fontSize: 10.5, marginTop: 8, fontFamily: 'Lexend_600SemiBold' },

  // Steps
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 26 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: { fontSize: 12, fontFamily: 'Lexend_700Bold' },
  stepConnector: { flex: 1, width: 2, marginVertical: 3 },
  stepBody: { flex: 1, paddingBottom: 14 },
  stepBodyLast: { paddingBottom: 0 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepTitle: { flexShrink: 1, fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },
  stepText: { fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // Benefit / choice lists
  listCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 11 },
  benefitIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowTitle: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  rowText: { fontSize: 11.5, lineHeight: 16.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  pickGoal: { flex: 1, fontSize: 12.5, lineHeight: 17.5, fontFamily: 'Lexend_500Medium' },
  pickBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pickBadgeText: { fontSize: 11, fontFamily: 'Lexend_700Bold' },

  // Combo callout
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 18,
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
  calloutTitle: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  calloutText: { fontSize: 12.5, lineHeight: 18, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  hint: { fontSize: 11.5, marginTop: 16, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
});
