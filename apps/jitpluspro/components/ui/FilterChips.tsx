import { useRef } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import { radius } from '@/utils/responsive';

export interface FilterChipItem<K extends string> {
  key: K;
  label: string;
  Icon?: LucideIcon;
  /** Size of the segment, shown after the label; undefined hides it. */
  count?: number;
}

function FilterChip({
  label,
  Icon,
  count,
  selected,
  onPress,
}: {
  label: string;
  Icon?: LucideIcon;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { locale } = useLanguage();
  const dir = useDir();
  const fg = selected ? theme.textInverse : theme.textSecondary;
  const countText = count === undefined ? null : count.toLocaleString(getIntlLocale(locale));
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { flexDirection: dir.row },
        selected
          ? { backgroundColor: theme.primary, borderColor: theme.primary }
          : { backgroundColor: theme.bgCard, borderColor: theme.border },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={countText ? `${label}, ${countText}` : label}
    >
      {Icon ? <Icon size={15} color={fg} strokeWidth={iconTokens.stroke} /> : null}
      <Text style={[styles.chipText, { color: fg }]} maxFontSizeMultiplier={1.4}>{label}</Text>
      {countText ? (
        <Text
          style={[styles.chipCount, { color: selected ? theme.textInverse : theme.textMuted }]}
          maxFontSizeMultiplier={1.4}
        >
          {countText}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

/** One-choice chip row that scrolls sideways (from the right in Arabic). */
export function FilterChips<K extends string>({
  items,
  selected,
  onSelect,
}: {
  items: readonly FilterChipItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
}) {
  const dir = useDir();
  const ref = useRef<ScrollView>(null);
  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { flexDirection: dir.row }]}
        keyboardShouldPersistTaps="handled"
        // Arabic reads from the right: start on the first chip when the row overflows.
        onContentSizeChange={dir.isRTL ? () => ref.current?.scrollToEnd({ animated: false }) : undefined}
      >
        {items.map((item) => (
          <FilterChip
            key={item.key}
            label={item.label}
            Icon={item.Icon}
            count={item.count}
            selected={item.key === selected}
            onPress={() => onSelect(item.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  chip: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: font.semibold, letterSpacing: -0.1 },
  chipCount: { fontSize: 13, fontFamily: font.regular },
});
