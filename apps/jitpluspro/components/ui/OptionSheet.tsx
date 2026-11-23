import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import BottomSheet from '@/components/ui/BottomSheet';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';

export interface OptionSection {
  key: string;
  title: string;
  options: readonly { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}

const MAX_BODY_HEIGHT = Dimensions.get('window').height * 0.6;

/**
 * Bottom sheet of one-choice lists (period, staff, sort). A tap applies the
 * choice right away: the list behind updates while the sheet is open, and
 * `closeOnSelect` closes it for single-list sheets.
 */
export function OptionSheet({
  visible,
  onClose,
  title,
  sections,
  doneLabel,
  resetLabel,
  onReset,
  closeOnSelect = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  sections: readonly OptionSection[];
  doneLabel: string;
  /** Shown only with `onReset` (i.e. when something is set). */
  resetLabel?: string;
  onReset?: () => void;
  closeOnSelect?: boolean;
}) {
  const theme = useTheme();
  const dir = useDir();

  const header = (
    <View style={[styles.header, { flexDirection: dir.row }]}>
      <Text style={[styles.title, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {onReset && resetLabel ? (
        <TouchableOpacity onPress={onReset} hitSlop={12} accessibilityRole="button" accessibilityLabel={resetLabel}>
          <Text style={[styles.reset, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>{resetLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} header={header} scrollable>
      <ScrollView style={{ maxHeight: MAX_BODY_HEIGHT }} showsVerticalScrollIndicator={false} bounces={false}>
        {sections.map((section) => (
          <View key={section.key} style={styles.section}>
            {sections.length > 1 ? (
              <Text style={[styles.sectionTitle, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
                {section.title}
              </Text>
            ) : null}
            <View style={[styles.group, { borderColor: theme.border, backgroundColor: theme.bgCard }]} accessibilityRole="radiogroup">
              {section.options.map((option, index) => {
                const selected = option.key === section.selected;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.option,
                      { flexDirection: dir.row },
                      index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight },
                    ]}
                    activeOpacity={0.6}
                    onPress={() => {
                      section.onSelect(option.key);
                      if (closeOnSelect) onClose();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={option.label}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: theme.text, textAlign: dir.textAlign },
                        selected && styles.optionTextSelected,
                      ]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.5}
                    >
                      {option.label}
                    </Text>
                    {selected ? <Check size={iconTokens.md} color={theme.primary} strokeWidth={iconTokens.strokeSmall} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      {closeOnSelect ? null : (
        <ActionButton label={doneLabel} size="lg" onPress={onClose} style={styles.done} />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  title: { flex: 1, fontSize: 20, fontFamily: font.semibold, letterSpacing: -0.3 },
  reset: { fontSize: 15, fontFamily: font.semibold },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 13, fontFamily: font.semibold, marginBottom: 8 },
  group: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  option: { alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  optionText: { flex: 1, fontSize: 15, fontFamily: font.regular },
  optionTextSelected: { fontFamily: font.semibold },
  done: { marginTop: 20 },
});
