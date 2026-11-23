import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { TextInput } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize, ms, radius, wp } from '@/utils/responsive';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  maxLength?: number;
  onSubmitEditing?: () => void;
  /** Shows a clear button while there is text. */
  onClear?: () => void;
  clearLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Search input of the list screens: magnifier, text, optional clear button. */
export default function SearchField({
  value, onChangeText, placeholder, accessibilityLabel, autoFocus, maxLength, onSubmitEditing, onClear, clearLabel, style,
}: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <View style={[styles.field, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }, style]}>
      <Search size={ms(18)} color={theme.inputPlaceholder} strokeWidth={1.75} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.inputPlaceholder}
        style={[styles.input, { color: theme.text, fontFamily: fonts.regular }]}
        maxLength={maxLength}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        autoCorrect={false}
        autoFocus={autoFocus}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {!!onClear && value.length > 0 && (
        <Pressable onPress={onClear} hitSlop={12} accessibilityRole="button" accessibilityLabel={clearLabel}>
          <X size={ms(18)} color={theme.textMuted} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: wp(8),
    height: ms(44), borderRadius: radius.md, borderWidth: 1, paddingHorizontal: wp(12),
  },
  input: { flex: 1, fontSize: fontSize.md, paddingVertical: 0 },
});
