import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { JitGift } from '@/components/icons';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import type { ReferralCodeState } from '@/hooks/useReferralCode';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import { formStyles } from './formStyles';

interface Props {
  referral: ReferralCodeState;
  disabled?: boolean;
}

/** "I have a referral code": collapsed by default, checked live once typed. */
export function ReferralField({ referral, disabled }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const { code, open, status, sponsorName, onChange, toggle } = referral;

  const hasInput = !!code.trim();
  const accent =
    status === 'valid' ? theme.success
      : status === 'invalid' ? theme.danger
        : hasInput ? palette.charbon
          : null;

  return (
    <>
      <TouchableOpacity
        style={[styles.toggle, { flexDirection: dir.row }]}
        onPress={toggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <JitGift size={ms(16)} color={theme.textSecondary} strokeWidth={icon.stroke} />
        <Text style={[styles.toggleText, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
          {t('registerExtra.referralToggle')}
        </Text>
        <ChevronDown size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} style={open ? styles.rotated : undefined} />
      </TouchableOpacity>

      {open && (
        <View style={formStyles.field}>
          <View
            style={[
              formStyles.inputRow,
              {
                flexDirection: dir.row,
                backgroundColor: theme.bgInput,
                borderColor: accent ?? theme.border,
                borderWidth: hasInput ? 2 : 1.5,
              },
            ]}
          >
            <JitGift size={ms(18)} strokeWidth={icon.stroke} color={accent ?? theme.textMuted} />
            <TextInput
              style={[formStyles.input, { color: theme.text, textAlign: dir.textAlign }]}
              value={code}
              onChangeText={onChange}
              placeholder={t('referral.referralCodePlaceholder')}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              editable={!disabled}
            />
            {status === 'checking' && <ActivityIndicator size="small" color={palette.charbon} />}
          </View>
          {status === 'valid' && (
            <Text style={[styles.feedback, { color: theme.success, textAlign: dir.textAlign }]}>
              {t('referral.referralCodeValid', { nom: sponsorName })}
            </Text>
          )}
          {status === 'invalid' && (
            <Text style={[styles.feedback, { color: theme.danger, textAlign: dir.textAlign }]}>
              {t('referral.referralCodeInvalid')}
            </Text>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { alignItems: 'center', gap: wp(8), paddingVertical: hp(6), marginBottom: hp(2) },
  toggleText: { flex: 1, fontSize: fontSize.sm, fontFamily: font.medium },
  feedback: { fontSize: fontSize.xs, marginTop: hp(6), fontFamily: font.medium },
  rotated: { transform: [{ rotate: '180deg' }] },
});
