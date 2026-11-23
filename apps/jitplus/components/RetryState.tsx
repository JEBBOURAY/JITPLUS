import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { hp, ms, wp } from '@/utils/responsive';

interface Props {
  message: string;
  /** Second, quieter line under the message (what to check). */
  hint?: string;
  /** Leave out when retrying cannot help (not found): only the message shows. */
  onRetry?: () => void;
  /** The alert icon above the message (detail screens). */
  withIcon?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Load error of a screen or list: what happened and a "Retry" button. */
export default function RetryState({ message, hint, onRetry, withIcon = false, style }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.wrap, style]}>
      {withIcon && <AlertCircle size={ms(44)} color={theme.danger} />}
      <Text style={[styles.text, { color: theme.textMuted }]}>{message}</Text>
      {!!hint && <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>}
      {onRetry && (
        <TouchableOpacity style={[styles.btn, { borderColor: theme.border }]} onPress={onRetry} accessibilityRole="button">
          <Text style={[styles.btnText, { color: theme.text }]}>{t('common.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: hp(12) },
  text: { fontSize: ms(15), fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: ms(13), lineHeight: ms(19), textAlign: 'center', marginTop: -hp(6) },
  btn: { marginTop: hp(4), paddingHorizontal: wp(24), paddingVertical: hp(10), borderRadius: 12, borderWidth: 1 },
  btnText: { fontWeight: '600', fontSize: ms(14) },
});
