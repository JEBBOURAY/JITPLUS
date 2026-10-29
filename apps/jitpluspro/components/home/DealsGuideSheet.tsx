import React from 'react';
import { View, Text, StyleSheet, I18nManager } from 'react-native';
import {
  Check,
  Globe,
  Lightbulb,
  Percent,
  Plus,
  RotateCcw,
  ShoppingBag,
} from 'lucide-react-native';
import {
  JitBell,
  JitDeals,
  JitGift,
  JitPin,
  JitStats,
  JitStore,
} from '@/components/icons';
import { DEAL_LIMITS, type DealOffer, type DealScope, type DealType } from '@jitplus/shared/src/deals';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PromoSheet, { SheetSectionLabel, useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';
import { DealPreviewRow, useDealMerchantLook } from '@/components/deals/DealRows';

// Same tone as the "Gratuit" promo banner that opens this sheet.
const TONE: PromoTone = 'red';
const ACCENT = PROMO_TONES[TONE].fill;
const DAY_MS = 86_400_000;

const EXAMPLE_OFFER: Required<DealOffer> = {
  type: 'PERCENT_OFF',
  percentOff: 20,
  originalPrice: null,
  dealPrice: null,
  buyQty: null,
  freeQty: null,
};

const SCOPES: readonly { scope: DealScope; Icon: LucideIcon }[] = [
  { scope: 'LOCAL', Icon: JitStore },
  { scope: 'ONLINE', Icon: Globe },
];

const OFFER_TYPES: readonly { type: DealType; Icon: LucideIcon; exampleKey: string }[] = [
  { type: 'PERCENT_OFF', Icon: Percent, exampleKey: 'home.dealsGuideExamplePercent' },
  { type: 'PRICE_DROP', Icon: JitDeals, exampleKey: 'home.dealsGuideExamplePriceDrop' },
  { type: 'BUY_X_GET_Y', Icon: ShoppingBag, exampleKey: 'home.dealsGuideExampleBogo' },
  { type: 'FREE_ITEM', Icon: JitGift, exampleKey: 'home.dealsGuideExampleFree' },
];

// The deals screen shows the same three steps.
const STEP_KEYS = ['deals.list.how1', 'deals.list.how2', 'deals.list.how3'] as const;

const GAINS: readonly { Icon: LucideIcon; n: number }[] = [
  { Icon: JitPin, n: 1 },
  { Icon: JitBell, n: 2 },
  { Icon: JitStats, n: 3 },
  { Icon: RotateCcw, n: 4 },
];

const TIP_KEYS = ['home.dealsGuideTip1', 'home.dealsGuideTip2', 'home.dealsGuideTip3'] as const;

interface DealsGuideSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Primary CTA ("create my deal"). Omitted when the user cannot create deals. */
  onCreate?: () => void;
}

/**
 * Guide sheet of the free "Bons plans": what customers see, where the offer
 * applies, which offer to pick, the 3 steps, what the merchant gains and a
 * few tips, then a CTA to create the first deal.
 */
function DealsGuideSheet({ visible, onClose, onCreate }: DealsGuideSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const look = useDealMerchantLook();
  const isRTL = I18nManager.isRTL;
  const accentInk = ink(TONE);
  const listCard = [styles.listCard, { backgroundColor: softFill, borderColor: hairline }];
  const divider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline };
  const exampleEndsAt = new Date(Date.now() + 5 * DAY_MS).toISOString();

  const facts = [
    { value: t('deals.price', { value: 0 }), label: t('home.dealsGuideFactFree') },
    { value: String(DEAL_LIMITS.MAX_ACTIVE), label: t('home.dealsGuideFactActive') },
    { value: t('deals.wizard.durationChip', { count: DEAL_LIMITS.MAX_DURATION_DAYS }), label: t('home.dealsGuideFactDays') },
  ];

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.dealsGuideHeroLabel')}
      title={t('home.dealsGuideTitle')}
      subtitle={t('home.dealsGuideSubtitle')}
      heroBadge={<JitDeals size={22} color={ACCENT} strokeWidth={2} />}
      heroFooter={
        <View style={[styles.facts, isRTL && styles.rowRtl]}>
          {facts.map((f) => (
            <View key={f.label} style={styles.fact} accessible accessibilityLabel={`${f.value} ${f.label}`}>
              <Text style={styles.factValue} maxFontSizeMultiplier={1.15}>{f.value}</Text>
              <Text style={styles.factLabel} maxFontSizeMultiplier={1.25}>{f.label}</Text>
            </View>
          ))}
        </View>
      }
      cta={onCreate ? { label: t('home.dealsGuideCta'), Icon: Plus, onPress: onCreate } : undefined}
    >
      {/* ── 1. Ce que voient vos clients ── */}
      <SheetSectionLabel text={t('deals.wizard.previewTitle')} tone={TONE} />
      <View style={[styles.previewFrame, { backgroundColor: theme.bg, borderColor: hairline }]}>
        <DealPreviewRow
          title={t('home.dealsGuidePreviewExample')}
          offer={EXAMPLE_OFFER}
          scope="LOCAL"
          imageUrl={null}
          endsAt={exampleEndsAt}
          merchant={look}
        />
      </View>
      <Text style={[styles.caption, { color: muted }]} maxFontSizeMultiplier={1.3}>
        {t('deals.wizard.previewHint')}
      </Text>

      {/* ── 2. En magasin ou en ligne ── */}
      <SheetSectionLabel text={t('deals.wizard.whereTitle')} tone={TONE} />
      <View style={[styles.scopesRow, isRTL && styles.rowRtl]}>
        {SCOPES.map(({ scope, Icon }) => (
          <View key={scope} style={[styles.scopeCard, { backgroundColor: softFill, borderColor: hairline }]}>
            <View style={styles.tintIcon}>
              <Icon size={16} color={accentInk} strokeWidth={2} />
            </View>
            <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
              {t(`deals.scope.${scope}`)}
            </Text>
            <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.4}>
              {t(`deals.scopeDesc.${scope}`)}
            </Text>
          </View>
        ))}
      </View>

      {/* ── 3. Quelle offre choisir ── */}
      <SheetSectionLabel text={t('home.dealsGuideTypesLabel')} tone={TONE} />
      <View style={listCard}>
        {OFFER_TYPES.map(({ type, Icon, exampleKey }, i) => (
          <View key={type} style={[styles.row, isRTL && styles.rowRtl, i > 0 && divider]}>
            <View style={styles.tintIcon}>
              <Icon size={16} color={accentInk} strokeWidth={2} />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                {t(`deals.type.${type}`)}
              </Text>
              <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.45}>
                {t(exampleKey)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── 4. En 3 étapes ── */}
      <SheetSectionLabel text={t('home.dealsGuideStepsLabel')} tone={TONE} />
      <View style={listCard}>
        {STEP_KEYS.map((key, i) => (
          <View key={key} style={[styles.row, styles.rowCentered, isRTL && styles.rowRtl, i > 0 && divider]}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText} maxFontSizeMultiplier={1.1}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
              {t(key)}
            </Text>
          </View>
        ))}
      </View>

      {/* ── 5. Ce que vous y gagnez ── */}
      <SheetSectionLabel text={t('home.dealsGuideGainsLabel')} tone={TONE} />
      <View style={listCard}>
        {GAINS.map(({ Icon, n }, i) => (
          <View key={n} style={[styles.row, isRTL && styles.rowRtl, i > 0 && divider]}>
            <View style={styles.gainCheck}>
              <Check size={12} color="#FFFFFF" strokeWidth={3} />
            </View>
            <View style={styles.flex1}>
              <View style={[styles.gainTitleRow, isRTL && styles.rowRtl]}>
                <Icon size={14} color={accentInk} strokeWidth={2} />
                <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                  {t(`home.dealsGuideGain${n}Title`)}
                </Text>
              </View>
              <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.45}>
                {t(`home.dealsGuideGain${n}Text`)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── 6. Nos conseils ── */}
      <SheetSectionLabel text={t('home.dealsGuideTipsLabel')} tone={TONE} />
      <View style={[styles.callout, isRTL && styles.rowRtl]}>
        <View style={styles.tintIcon}>
          <Lightbulb size={16} color={accentInk} strokeWidth={2} />
        </View>
        <View style={[styles.flex1, styles.tips]}>
          {TIP_KEYS.map((key) => (
            <Text key={key} style={[styles.tipText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.45}>
              {t(key)}
            </Text>
          ))}
        </View>
      </View>

      <Text style={[styles.freeNote, { color: muted }]} maxFontSizeMultiplier={1.3}>
        {t('deals.wizard.freeNote', { maxActive: DEAL_LIMITS.MAX_ACTIVE, maxPerDay: DEAL_LIMITS.MAX_CREATED_PER_DAY })}
      </Text>
    </PromoSheet>
  );
}

export default React.memo(DealsGuideSheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  flex1: { flex: 1 },

  // Hero key figures
  facts: { flexDirection: 'row', gap: 8, marginTop: 16 },
  fact: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.18)' },
  factValue: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Lexend_700Bold' },
  factLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 10.5, lineHeight: 14, marginTop: 2, fontFamily: 'Lexend_500Medium' },

  // Preview
  previewFrame: { borderRadius: 18, borderWidth: 1, padding: 8 },
  caption: { fontSize: 11, marginTop: 8, textAlign: 'center', fontFamily: 'Lexend_400Regular' },

  // Scopes
  scopesRow: { flexDirection: 'row', gap: 10 },
  scopeCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, gap: 4 },

  // Lists
  listCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 11 },
  rowCentered: { alignItems: 'center' },
  tintIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}1A`,
  },
  rowTitle: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  rowText: { fontSize: 11.5, lineHeight: 16.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // Steps
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: '#FFFFFF', fontSize: 11.5, fontFamily: 'Lexend_700Bold' },
  stepText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_500Medium' },

  // Gains
  gainCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  gainTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Tips
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
  tips: { gap: 8 },
  tipText: { fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_400Regular' },

  freeNote: { fontSize: 11.5, lineHeight: 16, marginTop: 16, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
});
