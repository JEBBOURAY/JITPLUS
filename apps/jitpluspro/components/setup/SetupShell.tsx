import { type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import { ms } from '@/utils/responsive';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
/** Fixed footer (12 + 50 button + 12) plus breathing room, above the bottom inset. */
const FOOTER_SPACE = 90;

interface Props {
  /** 0-based index of the current page and the number of pages. */
  index: number;
  total: number;
  /** Short name of the page, next to "Étape n sur N". */
  label: string;
  heading: string;
  hint: string;
  onBack: () => void;
  /** "Passer" in the header; omitted on pages that cannot be skipped. */
  onSkip?: () => void;
  scrollRef?: RefObject<ScrollView | null>;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * One page of the setup wizard: back arrow, progress segments, optional
 * "Passer", the page's heading and hint, scrollable content and a fixed
 * footer with the main action.
 */
export function SetupShell({ index, total, label, heading, hint, onBack, onSkip, scrollRef, footer, children }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const stepOf = t('setup.stepOf', { n: index + 1, total });

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10, flexDirection: dir.row }]}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={HIT_SLOP}
          style={[styles.iconBtn, { backgroundColor: theme.bgInput }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={iconTokens.md} color={theme.text} strokeWidth={iconTokens.stroke} style={dir.flip} />
        </TouchableOpacity>
        <View
          style={[styles.bar, { flexDirection: dir.row }]}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${stepOf}, ${label}`}
          accessibilityValue={{ min: 1, max: total, now: index + 1 }}
        >
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.segment, { backgroundColor: i <= index ? theme.primary : theme.bgInput }]} />
          ))}
        </View>
        {onSkip ? (
          <TouchableOpacity
            onPress={onSkip}
            hitSlop={HIT_SLOP}
            style={styles.skipBtn}
            accessibilityRole="button"
            accessibilityLabel={t('setup.skipA11y')}
          >
            <Text style={[styles.skipText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
              {t('setup.skip')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipBtn} />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FOOTER_SPACE }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={[styles.stepOf, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {stepOf}
            <Text style={{ color: theme.textSecondary }}> · {label}</Text>
          </Text>
          <Text style={[styles.heading, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {heading}
          </Text>
          <Text style={[styles.hint, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
            {hint}
          </Text>
        </View>
        {children}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: theme.bg, borderTopColor: theme.borderLight }]}>
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bar: { flex: 1, gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  skipBtn: { minWidth: 52, alignItems: 'flex-end', justifyContent: 'center', minHeight: 36 },
  skipText: { fontSize: 13, fontFamily: font.semibold },
  content: { paddingTop: 10 },
  intro: { paddingHorizontal: 16, paddingBottom: 6 },
  stepOf: { fontSize: 12, fontFamily: font.medium },
  heading: { marginTop: 6, fontSize: ms(22), lineHeight: ms(28), fontFamily: font.semibold, letterSpacing: -0.4 },
  hint: { marginTop: 6, fontSize: 14, lineHeight: 21, fontFamily: font.regular },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
