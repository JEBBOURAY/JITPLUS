import { ActivityIndicator, TouchableOpacity } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { DIR_FLIP } from '@/utils/rtl';
import { authStyles } from './authUi';

/** Main action of a sign-in screen: violet once the form is valid, muted before. */
export default function AuthPrimaryButton({ label, onPress, active, loading, disabled }: {
  label: string;
  onPress: () => void;
  /** The form is complete: the button turns violet. */
  active: boolean;
  loading: boolean;
  disabled: boolean;
}) {
  const theme = useTheme();
  const fg = active ? '#fff' : theme.textMuted;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      style={[authStyles.primaryBtn, active ? authStyles.primaryActive : { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          <Text style={[authStyles.primaryText, { color: fg }]}>{label}</Text>
          <ArrowRight size={ms(18)} color={fg} style={DIR_FLIP} />
        </>
      )}
    </TouchableOpacity>
  );
}
