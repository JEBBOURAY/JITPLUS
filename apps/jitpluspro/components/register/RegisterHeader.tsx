import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, ChevronDown, Globe } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import { formStyles, HIT_SLOP } from './formStyles';

export type RegisterStep = 1 | 2;
const STEP_COUNT = 2;

interface Props {
  step: RegisterStep;
  onBack: () => void;
  onOpenLanguage: () => void;
  disabled?: boolean;
}

/** Back button, language chip, progress bar and the step's title. */
export function RegisterHeader({ step, onBack, onOpenLanguage, disabled }: Props) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const dir = useDir();
  const language = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
  const stepText = t('registerExtra.stepOf', { step, total: STEP_COUNT });

  return (
    <>
      <View style={[styles.topBar, { flexDirection: dir.row }]}>
        <TouchableOpacity
          style={[formStyles.iconBtn, { backgroundColor: `${theme.text}08` }]}
          onPress={onBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={HIT_SLOP}
        >
          <ArrowLeft size={ms(20)} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>

        {/* The language already follows the phone; this only lets the merchant change it. */}
        <TouchableOpacity
          style={[styles.langChip, { flexDirection: dir.row, backgroundColor: `${theme.text}08` }]}
          onPress={onOpenLanguage}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('register.languageLabel')}
        >
          <Globe size={ms(14)} color={theme.textSecondary} strokeWidth={icon.stroke} />
          <Text style={[styles.langChipText, { color: theme.text }]}>{language.flag} {locale.toUpperCase()}</Text>
          <ChevronDown size={ms(14)} color={theme.textMuted} strokeWidth={icon.stroke} />
        </TouchableOpacity>
      </View>

      <View style={styles.progress} accessible accessibilityLabel={stepText}>
        <View style={[styles.progressRow, { flexDirection: dir.row }]}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <View
              key={i}
              style={[styles.progressSegment, { backgroundColor: i < step ? palette.charbon : theme.border }]}
            />
          ))}
        </View>
        <Text style={[styles.progressText, { color: theme.textMuted, textAlign: dir.textAlign }]}>
          {stepText} · {step === 1 ? t('registerExtra.step1Label') : t('registerExtra.step2Label')}
        </Text>
      </View>

      <View style={styles.titleWrap}>
        <Text style={[styles.title, { color: theme.text, textAlign: dir.textAlign }]}>
          {step === 1 ? t('register.title') : t('registerExtra.step2Title')}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: { alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(10) },
  langChip: { alignItems: 'center', gap: wp(6), paddingHorizontal: wp(10), height: ms(36), borderRadius: 999 },
  langChipText: { fontSize: fontSize.sm, fontFamily: font.semibold },
  progress: { marginBottom: hp(10) },
  progressRow: { gap: wp(6) },
  progressSegment: { flex: 1, height: ms(4), borderRadius: ms(2) },
  progressText: { marginTop: hp(6), fontSize: fontSize.xs, fontFamily: font.semibold },
  titleWrap: { marginBottom: hp(4) },
  title: { fontSize: ms(24), letterSpacing: -0.5, marginBottom: hp(1), fontFamily: font.semibold },
});
