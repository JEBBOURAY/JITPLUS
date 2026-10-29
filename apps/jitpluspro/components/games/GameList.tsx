import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';

/** "+" button in the header of a game list. */
export function HeaderAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.addBtn, { backgroundColor: theme.primary }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Plus size={20} color="#FFFFFF" strokeWidth={icon.stroke} />
    </TouchableOpacity>
  );
}

/** First visit of a game: what it does, three numbered steps, then the create button. */
export function GameEmptyState({ visual, title, text, steps, action }: {
  visual: React.ReactNode;
  title: string;
  text: string;
  steps: string[];
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const { row, textAlign } = useDir();
  return (
    <View style={[styles.empty, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      {visual}
      <Text style={[styles.emptyTitle, { color: theme.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{title}</Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>{text}</Text>
      <View style={styles.steps}>
        {steps.map((step, i) => (
          <View key={step} style={[styles.stepRow, { flexDirection: row }]}>
            <View style={[styles.stepNum, { backgroundColor: `${theme.primary}14` }]}>
              <Text style={[styles.stepNumText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>{step}</Text>
          </View>
        ))}
      </View>
      {action}
    </View>
  );
}

export interface CampaignLine {
  text: string;
  tone?: 'muted' | 'secondary';
  /** Overrides the tone, e.g. a fixed status hue */
  color?: string;
}

/** One campaign of a game list: visual, name and status, then a few info lines. */
export function CampaignRow({ leading, title, status, lines, onPress, accessibilityLabel }: {
  leading: React.ReactNode;
  title: string;
  status: React.ReactNode;
  lines: CampaignLine[];
  onPress: () => void;
  /** Name and status; the info lines are appended */
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const { row, textAlign, flip } = useDir();
  const toneColor = { muted: theme.textMuted, secondary: theme.textSecondary };
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={[accessibilityLabel, ...lines.map((line) => line.text)].join(', ')}
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, flexDirection: row }]}
    >
      {leading}
      <View style={styles.cardBody}>
        <View style={[styles.cardTop, { flexDirection: row }]}>
          <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          {status}
        </View>
        {lines.map((line, i) => (
          <Text
            key={i}
            style={[styles.cardMeta, { color: line.color ?? toneColor[line.tone ?? 'muted'], textAlign }]}
            maxFontSizeMultiplier={1.3}
          >
            {line.text}
          </Text>
        ))}
      </View>
      <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={flip} />
    </TouchableOpacity>
  );
}

export function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  empty: { alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 22 },
  emptyTitle: { fontSize: ms(17), fontFamily: font.semibold, textAlign: 'center' },
  emptyText: { fontSize: ms(13), lineHeight: ms(20), fontFamily: font.regular, textAlign: 'center' },
  steps: { alignSelf: 'stretch', gap: 8 },
  stepRow: { alignItems: 'center', gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: ms(13), fontFamily: font.bold },
  stepText: { flex: 1, fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
  card: { alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: ms(15), fontFamily: font.semibold },
  cardMeta: { fontSize: ms(12), fontFamily: font.regular, lineHeight: ms(18) },
  separator: { height: 10 },
});
