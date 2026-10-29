import { memo } from 'react';
import { View } from 'react-native';
import { CheckCircle2, Calendar, Gift, Lock } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { TermsCheckbox } from './TermsCheckbox';
import { s, ICON_16, ICON_18, ICON_20 } from './styles';
import type { TranslateFn } from './types';

interface BirthdayStepProps {
  theme: ThemeColors;
  t: TranslateFn;
  dateNaissance: string;
  dateValid: boolean;
  termsAccepted: boolean;
  onDateChange: (v: string) => void;
  onToggleTerms: () => void;
}

export const BirthdayStep = memo(function BirthdayStep({
  theme, t, dateNaissance, dateValid, termsAccepted, onDateChange, onToggleTerms,
}: BirthdayStepProps) {
  return (
    <View>
      <View style={s.field}>
        <Text style={[s.label, { color: theme.textSecondary }]}>
          {t('completeProfile.dateNaissance')}{' '}
          <Text style={{ fontWeight: '400', color: theme.textMuted }}>({t('completeProfile.optional')})</Text>
        </Text>
        <View style={[s.inputWrap, {
          backgroundColor: theme.bgInput,
          borderColor: dateValid ? palette.violet : theme.border,
        }]}>
          <Calendar size={ICON_18} color={dateValid ? palette.violet : theme.textMuted} strokeWidth={2} />
          <TextInput
            style={[s.input, { color: theme.text }]}
            placeholder={t('completeProfile.dateNaissancePlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={dateNaissance}
            onChangeText={onDateChange}
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
            returnKeyType="done"
          />
          {dateValid && <CheckCircle2 size={ICON_16} color={palette.violet} strokeWidth={2} />}
        </View>
      </View>

      <View style={[s.birthdayCard, { backgroundColor: `${palette.gold}12`, borderColor: `${palette.gold}30` }]}>
        <Gift size={ICON_20} color={palette.gold} strokeWidth={1.5} />
        <View style={{ flex: 1 }}>
          <Text style={[s.birthdayTitle, { color: palette.gray900 }]}>
            {t('completeProfile.birthdayGiftTitle')}
          </Text>
          <Text style={[s.birthdayDesc, { color: palette.gray500 }]}>
            {t('completeProfile.birthdayGiftDesc')}
          </Text>
        </View>
      </View>

      <View style={[s.infoBox, { backgroundColor: `${palette.gold}08` }]}>
        <Lock size={ICON_16} color={palette.gold} strokeWidth={1.5} />
        <Text style={[s.infoText, { color: theme.textMuted }]}>
          {t('completeProfile.birthdayPrivacy')}
        </Text>
      </View>

      {/* Social sign-ups reach this screen without having seen the terms */}
      <TermsCheckbox theme={theme} t={t} checked={termsAccepted} onToggle={onToggleTerms} />
    </View>
  );
});
