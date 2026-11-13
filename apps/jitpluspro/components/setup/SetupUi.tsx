import { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import type { LucideIcon } from '@/components/home/PromoSheet';

/** Done / to-do line of the recap, tappable to jump back to its page. */
export function StatusRow({ Icon, title, summary, done, onPress, last }: {
  Icon: LucideIcon;
  title: string;
  summary: string;
  done: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      style={[styles.row, { flexDirection: dir.row }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderLight }]}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${title}, ${summary}`}
      accessibilityHint={done || !onPress ? undefined : t('setup.done.toComplete')}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.primaryBg }]}>
        <Icon size={17} color={theme.primary} strokeWidth={iconTokens.stroke} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={[styles.rowBody, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{summary}</Text>
      </View>
      {done ? (
        <View style={[styles.doneDot, { backgroundColor: `${theme.success}1F` }]}>
          <Check size={12} color={theme.success} strokeWidth={iconTokens.strokeSmall} />
        </View>
      ) : (
        <View style={[styles.todoDot, { backgroundColor: theme.warning }]} />
      )}
      {onPress ? <ChevronRight size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} style={dir.flip} /> : null}
    </TouchableOpacity>
  );
}

/** Small "Logo ajouté" / "À ajouter" pill under a control. */
export function DonePill({ done, doneLabel, todoLabel }: { done: boolean; doneLabel: string; todoLabel: string }) {
  const theme = useTheme();
  const dir = useDir();
  const color = done ? theme.success : theme.textMuted;
  return (
    <View style={[styles.pill, { flexDirection: dir.row, backgroundColor: done ? `${theme.success}1A` : theme.bgInput }]}>
      {done ? <Check size={12} color={color} strokeWidth={iconTokens.strokeSmall} /> : null}
      <Text style={[styles.pillText, { color }]} maxFontSizeMultiplier={1.2}>{done ? doneLabel : todoLabel}</Text>
    </View>
  );
}

/** Selectable suggestion ("Café offert", "-20 %…"). */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.primaryBg : theme.bgInput, borderColor: selected ? theme.primary : 'transparent' },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      <Text style={[styles.chipText, { color: selected ? theme.primary : theme.text }]} maxFontSizeMultiplier={1.2}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Soft tinted note under a control (where the data shows up, Pro hint…). */
export function Note({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <Text style={[styles.note, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontFamily: font.semibold, letterSpacing: -0.1 },
  rowBody: { fontSize: 12.5, lineHeight: 18, fontFamily: font.regular },
  doneDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  todoDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 7 },
  pill: { alignSelf: 'flex-start', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11.5, fontFamily: font.semibold },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: font.medium },
  note: { fontSize: 12.5, lineHeight: 18, marginTop: 10, fontFamily: font.regular },
});
