import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

/**
 * Content blocks shared by the Accueil guide sheets (WhyLoyalty, Deals, Games,
 * ClientAppPitch): icon lists, check lists, numbered timelines and the tinted
 * callout. Each block takes the tone of the sheet (or of one game).
 */

export interface SheetItem {
  Icon: LucideIcon;
  title: string;
  text: string;
  /** Overrides the list tone for this row's icon. */
  tone?: PromoTone;
}

/** Hairline between two rows of a list card. */
function useDivider() {
  const { hairline } = useSheetColors();
  return { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline };
}

function ListCard({ children }: { children: React.ReactNode }) {
  const { softFill, hairline } = useSheetColors();
  return <View style={[styles.listCard, { backgroundColor: softFill, borderColor: hairline }]}>{children}</View>;
}

function RowText({ title, text }: { title: string; text: string }) {
  const theme = useTheme();
  const { muted } = useSheetColors();
  return (
    <>
      <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
        {title}
      </Text>
      <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.45}>
        {text}
      </Text>
    </>
  );
}

/** Card of rows: tinted icon, title and text. */
export function SheetIconList({ items, tone }: { items: readonly SheetItem[]; tone: PromoTone }) {
  const { ink } = useSheetColors();
  const { isRTL } = useDir();
  const divider = useDivider();
  return (
    <ListCard>
      {items.map((item, i) => {
        const rowTone = item.tone ?? tone;
        return (
          <View key={i} style={[styles.row, isRTL && styles.rowRtl, i > 0 && divider]}>
            <View style={[styles.tintIcon, { backgroundColor: `${PROMO_TONES[rowTone].fill}1A` }]}>
              <item.Icon size={16} color={ink(rowTone)} strokeWidth={2} />
            </View>
            <View style={styles.flex1}>
              <RowText title={item.title} text={item.text} />
            </View>
          </View>
        );
      })}
    </ListCard>
  );
}

/** Card of rows: filled check, then a small icon before the title, and the text. */
export function SheetCheckList({ items, tone }: { items: readonly SheetItem[]; tone: PromoTone }) {
  const theme = useTheme();
  const { ink, muted } = useSheetColors();
  const { isRTL } = useDir();
  const divider = useDivider();
  const toneInk = ink(tone);
  return (
    <ListCard>
      {items.map((item, i) => (
        <View key={i} style={[styles.row, isRTL && styles.rowRtl, i > 0 && divider]}>
          <View style={[styles.check, { backgroundColor: PROMO_TONES[tone].fill }]}>
            <Check size={12} color="#FFFFFF" strokeWidth={3} />
          </View>
          <View style={styles.flex1}>
            <View style={[styles.iconTitleRow, isRTL && styles.rowRtl]}>
              <item.Icon size={14} color={toneInk} strokeWidth={2} />
              <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                {item.title}
              </Text>
            </View>
            <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.45}>
              {item.text}
            </Text>
          </View>
        </View>
      ))}
    </ListCard>
  );
}

/**
 * Numbered timeline. `lastFilled`: the last dot is filled with the step icon
 * (the step that closes a cycle).
 */
export function SheetSteps({ steps, tone, lastFilled = false }: {
  steps: readonly SheetItem[];
  tone: PromoTone;
  lastFilled?: boolean;
}) {
  const theme = useTheme();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const { isRTL } = useDir();
  const fill = PROMO_TONES[tone].fill;
  const toneInk = ink(tone);

  return (
    <View style={[styles.stepsCard, { backgroundColor: softFill, borderColor: hairline }]}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const filled = last && lastFilled;
        return (
          <View key={i} style={[styles.stepRow, isRTL && styles.rowRtl]}>
            <View style={styles.stepRail}>
              <View style={[styles.stepDot, { backgroundColor: filled ? fill : `${fill}1A`, borderColor: fill }]}>
                {filled ? (
                  <step.Icon size={15} color="#FFFFFF" strokeWidth={2.2} />
                ) : (
                  <Text style={[styles.stepDotText, { color: toneInk }]} maxFontSizeMultiplier={1.1}>
                    {i + 1}
                  </Text>
                )}
              </View>
              {!last ? <View style={[styles.stepConnector, { backgroundColor: `${fill}33` }]} /> : null}
            </View>
            <View style={[styles.stepBody, last && styles.stepBodyLast]}>
              <View style={[styles.iconTitleRow, isRTL && styles.rowRtl]}>
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

/** Tone-tinted box: icon, optional title, then one or more paragraphs. */
export function SheetCallout({ Icon, tone, title, lines, style }: {
  Icon: LucideIcon;
  tone: PromoTone;
  title?: string;
  lines: readonly string[];
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { ink } = useSheetColors();
  const { isRTL } = useDir();
  const fill = PROMO_TONES[tone].fill;
  return (
    <View
      style={[
        styles.callout,
        isRTL && styles.rowRtl,
        { backgroundColor: `${fill}12`, borderColor: `${fill}30` },
        style,
      ]}
    >
      <View style={[styles.calloutIcon, { backgroundColor: `${fill}1F` }]}>
        <Icon size={17} color={ink(tone)} strokeWidth={2} />
      </View>
      <View style={[styles.flex1, styles.calloutLines]}>
        {title ? (
          <Text style={[styles.rowTitle, styles.calloutTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
            {title}
          </Text>
        ) : null}
        {lines.map((line, i) => (
          <Text key={i} style={[styles.calloutText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.45}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  flex1: { flex: 1 },

  // Lists
  listCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 11 },
  tintIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowTitle: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  rowText: { fontSize: 11.5, lineHeight: 16.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  iconTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Steps
  stepsCard: { borderRadius: 18, borderWidth: 1, padding: 16 },
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
  stepDotText: { fontSize: 12, fontFamily: 'Lexend_600SemiBold' },
  stepConnector: { flex: 1, width: 2, marginVertical: 3 },
  stepBody: { flex: 1, paddingBottom: 14 },
  stepBodyLast: { paddingBottom: 0 },
  stepTitle: { flexShrink: 1, fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },
  stepText: { fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // Callout
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  calloutIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calloutLines: { gap: 8 },
  // The title sits close to its paragraph: cancels most of the lines gap.
  calloutTitle: { marginBottom: -6 },
  calloutText: { fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_400Regular' },
});
