import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import { FieldError } from './FieldError';

interface Props {
  accepted: boolean;
  onToggle: () => void;
  onOpenTerms: () => void;
  showError: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
}

/** "J'accepte les conditions générales d'utilisation" checkbox of the sign-up form. */
export function TermsCheckbox({ accepted, onToggle, onOpenTerms, showError, onLayout }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  return (
    <View onLayout={onLayout}>
      <TouchableOpacity
        style={[styles.row, { flexDirection: dir.row }]}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
      >
        <View
          style={[
            styles.checkbox,
            dir.isRTL ? styles.checkboxRtl : styles.checkboxLtr,
            {
              borderColor: accepted ? theme.primary : showError ? theme.danger : theme.border,
              backgroundColor: accepted ? theme.primary : 'transparent',
            },
          ]}
        >
          {accepted && <Check size={ms(14)} color="#fff" strokeWidth={icon.strokeSmall} />}
        </View>
        <Text style={[styles.text, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
          {t('registerExtra.termsText')}{' '}
          <Text style={[styles.link, { color: theme.primary }]} onPress={onOpenTerms}>
            {t('registerExtra.termsLink')}
          </Text>
        </Text>
      </TouchableOpacity>
      {showError && <FieldError>{t('registerExtra.termsRequired')}</FieldError>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', marginTop: hp(2), marginBottom: hp(1), paddingHorizontal: wp(1) },
  checkbox: { width: ms(22), height: ms(22), borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxLtr: { marginRight: ms(10) },
  checkboxRtl: { marginLeft: ms(10) },
  text: { flex: 1, fontSize: fontSize.sm, lineHeight: ms(20), fontFamily: font.regular },
  link: { fontFamily: font.semibold },
});
