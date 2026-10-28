import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { s } from './styles';
import type { TranslateFn } from './types';

interface TermsCheckboxProps {
  theme: ThemeColors;
  t: TranslateFn;
  checked: boolean;
  onToggle: () => void;
}

export const TermsCheckbox = memo(function TermsCheckbox({ theme, t, checked, onToggle }: TermsCheckboxProps) {
  return (
    <TouchableOpacity
      style={s.termsRow}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[s.checkbox, {
        backgroundColor: checked ? palette.violet : 'transparent',
        borderColor: checked ? palette.violet : theme.border,
      }]}>
        {checked && <Check size={ms(14)} color="#fff" strokeWidth={3} />}
      </View>
      <Text style={[s.termsText, { color: theme.textSecondary }]}>
        {t('register.acceptTerms')}
        <Text
          style={{ color: palette.violet, textDecorationLine: 'underline' }}
          onPress={() => router.push('/legal/terms')}
        >
          {t('register.termsLink')}
        </Text>
        {t('register.termsAnd')}
        <Text
          style={{ color: palette.violet, textDecorationLine: 'underline' }}
          onPress={() => router.push('/legal/privacy')}
        >
          {t('register.privacyLink')}
        </Text>
      </Text>
    </TouchableOpacity>
  );
});
