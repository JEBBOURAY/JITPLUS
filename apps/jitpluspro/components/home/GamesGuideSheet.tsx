import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import {
  Trophy,
  Repeat,
  ShoppingBasket,
  PartyPopper,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  LayoutGrid,
  Scissors,
  CheckCheck,
  Rocket,
} from 'lucide-react-native';
import {
  JitBell,
  JitCalendar,
  JitClients,
  JitGames,
  JitGift,
  JitScan,
  JitStar,
  JitStats,
  JitTicket,
} from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import PromoSheet, { SheetSectionLabel, useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { SheetCallout, SheetIconList, SheetSteps, type SheetItem } from '@/components/home/SheetBlocks';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

// Same tone as the promo banner that opens this sheet.
const TONE: PromoTone = 'pink';
const WHEEL: PromoTone = 'pink';
const SCRATCH: PromoTone = 'amber';
const COLLECTION: PromoTone = 'emerald';
const ACCENT = PROMO_TONES[TONE].fill;

type Pick = 'wheel' | 'scratch' | 'collection' | 'both';

interface GamesGuideSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Primary CTA: opens the games hub (lucky wheel, scratch cards, collection). */
  onStart: () => void;
}

/**
 * Accueil guide comparing the three games (lucky wheel, scratch card,
 * collection): what each one is for, how it works in 3 steps, what it brings,
 * shop ideas for the collection (new products, whole menu, seasons), which one
 * to pick for a given goal, and a CTA to launch a first game.
 */
function GamesGuideSheet({ visible, onClose, onStart }: GamesGuideSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const { isRTL } = useDir();

  type GameCardData = { tone: PromoTone; Icon: LucideIcon; name: string; tagline: string; text: string; tags: string };
  const games: GameCardData[] = [
    {
      tone: WHEEL,
      Icon: JitGames,
      name: t('home.gamesGuideWheelName'),
      tagline: t('home.gamesGuideWheelTagline'),
      text: t('home.gamesGuideWheelText'),
      tags: t('home.gamesGuideWheelTags'),
    },
    {
      tone: SCRATCH,
      Icon: JitTicket,
      name: t('home.gamesGuideScratchName'),
      tagline: t('home.gamesGuideScratchTagline'),
      text: t('home.gamesGuideScratchText'),
      tags: t('home.gamesGuideScratchTags'),
    },
  ];
  const collectionGame: GameCardData = {
    tone: COLLECTION,
    Icon: JitGift,
    name: t('home.gamesGuideCollectionName'),
    tagline: t('home.gamesGuideCollectionTagline'),
    text: t('home.gamesGuideCollectionText'),
    tags: t('home.gamesGuideCollectionTags'),
  };

  const wheelSteps: SheetItem[] = [
    { Icon: JitGames, title: t('home.gamesGuideWheelStep1Title'), text: t('home.gamesGuideWheelStep1Text') },
    { Icon: JitScan, title: t('home.gamesGuideWheelStep2Title'), text: t('home.gamesGuideWheelStep2Text') },
    { Icon: Trophy, title: t('home.gamesGuideWheelStep3Title'), text: t('home.gamesGuideWheelStep3Text') },
  ];

  const wheelBenefits: SheetItem[] = [
    { Icon: Repeat, title: t('home.gamesGuideWheelBenefit1Title'), text: t('home.gamesGuideWheelBenefit1Text') },
    { Icon: ShoppingBasket, title: t('home.gamesGuideWheelBenefit2Title'), text: t('home.gamesGuideWheelBenefit2Text') },
    { Icon: PartyPopper, title: t('home.gamesGuideWheelBenefit3Title'), text: t('home.gamesGuideWheelBenefit3Text') },
  ];

  const scratchSteps: SheetItem[] = [
    { Icon: JitGift, title: t('home.gamesGuideScratchStep1Title'), text: t('home.gamesGuideScratchStep1Text') },
    { Icon: JitClients, title: t('home.gamesGuideScratchStep2Title'), text: t('home.gamesGuideScratchStep2Text') },
    { Icon: JitScan, title: t('home.gamesGuideScratchStep3Title'), text: t('home.gamesGuideScratchStep3Text') },
  ];

  const scratchBenefits: SheetItem[] = [
    { Icon: JitBell, title: t('home.gamesGuideScratchBenefit1Title'), text: t('home.gamesGuideScratchBenefit1Text') },
    { Icon: ShieldCheck, title: t('home.gamesGuideScratchBenefit2Title'), text: t('home.gamesGuideScratchBenefit2Text') },
    { Icon: JitStats, title: t('home.gamesGuideScratchBenefit3Title'), text: t('home.gamesGuideScratchBenefit3Text') },
  ];

  const collectionSteps: SheetItem[] = [
    { Icon: JitGift, title: t('home.gamesGuideCollectionStep1Title'), text: t('home.gamesGuideCollectionStep1Text') },
    { Icon: JitScan, title: t('home.gamesGuideCollectionStep2Title'), text: t('home.gamesGuideCollectionStep2Text') },
    { Icon: Trophy, title: t('home.gamesGuideCollectionStep3Title'), text: t('home.gamesGuideCollectionStep3Text') },
  ];

  const collectionBenefits: SheetItem[] = [
    { Icon: Sparkles, title: t('home.gamesGuideCollectionBenefit1Title'), text: t('home.gamesGuideCollectionBenefit1Text') },
    { Icon: ShoppingBasket, title: t('home.gamesGuideCollectionBenefit2Title'), text: t('home.gamesGuideCollectionBenefit2Text') },
    { Icon: Repeat, title: t('home.gamesGuideCollectionBenefit3Title'), text: t('home.gamesGuideCollectionBenefit3Text') },
  ];

  // Concrete shop examples: what to put in a collection to sell more and get new products tried.
  const collectionIdeas: SheetItem[] = [
    { Icon: Rocket, title: t('home.gamesGuideIdea1Title'), text: t('home.gamesGuideIdea1Text') },
    { Icon: LayoutGrid, title: t('home.gamesGuideIdea2Title'), text: t('home.gamesGuideIdea2Text') },
    { Icon: Scissors, title: t('home.gamesGuideIdea3Title'), text: t('home.gamesGuideIdea3Text') },
    { Icon: JitCalendar, title: t('home.gamesGuideIdea4Title'), text: t('home.gamesGuideIdea4Text') },
    { Icon: CheckCheck, title: t('home.gamesGuideIdea5Title'), text: t('home.gamesGuideIdea5Text') },
  ];

  const picks: { goal: string; pick: Pick }[] = [
    { goal: t('home.gamesGuideChoice1'), pick: 'wheel' },
    { goal: t('home.gamesGuideChoice2'), pick: 'wheel' },
    { goal: t('home.gamesGuideChoice6'), pick: 'collection' },
    { goal: t('home.gamesGuideChoice7'), pick: 'collection' },
    { goal: t('home.gamesGuideChoice3'), pick: 'scratch' },
    { goal: t('home.gamesGuideChoice4'), pick: 'scratch' },
    { goal: t('home.gamesGuideChoice5'), pick: 'both' },
  ];

  const pickLabel: Record<Pick, string> = {
    wheel: t('home.gamesGuidePickWheel'),
    scratch: t('home.gamesGuidePickScratch'),
    collection: t('home.gamesGuidePickCollection'),
    both: t('home.gamesGuidePickBoth'),
  };
  const pickTone: Record<Pick, PromoTone> = { wheel: WHEEL, scratch: SCRATCH, collection: COLLECTION, both: 'violet' };

  const renderGameCard = (g: GameCardData, wide?: boolean) => {
    const fill = PROMO_TONES[g.tone].fill;
    const toneInk = ink(g.tone);
    return (
      <View key={g.name} style={[styles.gameCard, wide && styles.gameCardWide, { backgroundColor: `${fill}10`, borderColor: `${fill}55` }]}>
        <View style={[styles.gameIcon, { backgroundColor: `${fill}1F` }]}>
          <g.Icon size={18} color={toneInk} strokeWidth={2} />
        </View>
        <Text style={[styles.gameName, { color: toneInk }]} maxFontSizeMultiplier={1.2}>
          {g.name}
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
  };

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.gamesGuideHeroLabel')}
      title={t('home.gamesGuideTitle')}
      subtitle={t('home.gamesGuideSubtitle')}
      heroBadge={<JitGames size={22} color={ACCENT} strokeWidth={2} />}
      cta={{ label: t('home.gamesGuideCta'), Icon: JitStar, onPress: onStart }}
    >
      {/* ── 1. Les trois jeux en un coup d'œil ── */}
      <SheetSectionLabel text={t('home.gamesGuideCompareLabel')} tone={TONE} />
      <View style={[styles.gamesRow, isRTL && styles.rowRtl]}>
        {games.map((g) => renderGameCard(g))}
      </View>
      {renderGameCard(collectionGame, true)}

      {/* ── 2. La roue de la chance ── */}
      <SheetSectionLabel text={t('home.gamesGuideWheelStepsLabel')} tone={WHEEL} Icon={JitGames} />
      <SheetSteps steps={wheelSteps} tone={WHEEL} />
      <SheetSectionLabel text={t('home.gamesGuideWheelBenefitsLabel')} tone={WHEEL} />
      <SheetIconList items={wheelBenefits} tone={WHEEL} />

      {/* ── 3. La carte à gratter ── */}
      <SheetSectionLabel text={t('home.gamesGuideScratchStepsLabel')} tone={SCRATCH} Icon={JitTicket} />
      <SheetSteps steps={scratchSteps} tone={SCRATCH} />
      <SheetSectionLabel text={t('home.gamesGuideScratchBenefitsLabel')} tone={SCRATCH} />
      <SheetIconList items={scratchBenefits} tone={SCRATCH} />

      {/* ── 4. La collection ── */}
      <SheetSectionLabel text={t('home.gamesGuideCollectionStepsLabel')} tone={COLLECTION} Icon={JitGift} />
      <SheetSteps steps={collectionSteps} tone={COLLECTION} />
      <SheetSectionLabel text={t('home.gamesGuideCollectionBenefitsLabel')} tone={COLLECTION} />
      <SheetIconList items={collectionBenefits} tone={COLLECTION} />
      <SheetSectionLabel text={t('home.gamesGuideIdeasLabel')} tone={COLLECTION} Icon={Lightbulb} />
      <SheetIconList items={collectionIdeas} tone={COLLECTION} />

      {/* ── 5. Lequel choisir ? ── */}
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

      {/* ── 6. Le combo gagnant ── */}
      <SheetCallout
        Icon={Lightbulb}
        tone={TONE}
        title={t('home.gamesGuideComboTitle')}
        lines={[t('home.gamesGuideComboText')]}
        style={styles.comboCallout}
      />

      <Text style={[styles.hint, { color: muted }]} maxFontSizeMultiplier={1.3}>
        {t('home.gamesGuideHint')}
      </Text>
    </PromoSheet>
  );
}

export default React.memo(GamesGuideSheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },

  // Games comparison
  gamesRow: { flexDirection: 'row', gap: 10 },
  gameCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
  gameCardWide: { flex: 0, marginTop: 10 },
  gameIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gameName: { fontSize: 12, fontFamily: 'Lexend_500Medium' },
  gameTagline: { fontSize: 13.5, lineHeight: 18, fontFamily: 'Lexend_600SemiBold', marginTop: 3 },
  gameText: { fontSize: 11.5, lineHeight: 16, marginTop: 5, fontFamily: 'Lexend_400Regular' },
  gameTags: { fontSize: 10.5, marginTop: 8, fontFamily: 'Lexend_600SemiBold' },

  // Choice list
  listCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  pickGoal: { flex: 1, fontSize: 12.5, lineHeight: 17.5, fontFamily: 'Lexend_500Medium' },
  pickBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pickBadgeText: { fontSize: 11, fontFamily: 'Lexend_600SemiBold' },

  comboCallout: { marginTop: 18 },

  hint: { fontSize: 11.5, marginTop: 16, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
});
