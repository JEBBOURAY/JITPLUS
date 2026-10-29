import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Pencil } from 'lucide-react-native';
import { usePreventRemove } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, ScreenHeader } from '@/components/scratch/ScratchUI';
import type { FormError } from './gameForm';

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * Step navigation shared by the game wizards: validation before moving on,
 * back through the steps (Android button included) and a discard prompt on exit,
 * swipe-back included. Texts come from `<i18nPrefix>.step.<step>.label|title|hint`
 * and `<i18nPrefix>.discardTitle|discardMessage|discardConfirm`.
 */
export function useGameWizard<S extends string>({ steps, validate, dirty, onLeave, i18nPrefix }: {
  steps: readonly S[];
  validate: (step: S) => FormError | null;
  dirty: boolean;
  onLeave: () => void;
  i18nPrefix: 'luckyWheel.wizard' | 'scratch.wizard' | 'deals.wizard';
}) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const lastIndex = steps.length - 1;
  const step = steps[index];

  // Also covers the iOS swipe-back, which removes the screen without going through `back`.
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => confirmDiscard(repeat));

  const showError = useCallback((err: FormError) => Alert.alert(t('common.error'), t(err.key, err.params)), [t]);

  const confirmDiscard = useCallback((discard: () => void) => {
    Alert.alert(t(`${i18nPrefix}.discardTitle`), t(`${i18nPrefix}.discardMessage`), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t(`${i18nPrefix}.discardConfirm`),
        style: 'destructive',
        onPress: () => {
          disablePrevention();
          discard();
        },
      },
    ]);
  }, [i18nPrefix, t, disablePrevention]);

  const goTo = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(i, lastIndex)));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [lastIndex]);

  const next = useCallback(() => {
    const err = validate(steps[index]);
    if (err) return showError(err);
    goTo(index + 1);
  }, [validate, steps, index, showError, goTo]);

  const back = useCallback(() => {
    if (index > 0) return goTo(index - 1);
    if (!dirty) return onLeave();
    confirmDiscard(onLeave);
  }, [index, dirty, onLeave, goTo, confirmDiscard]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [back]);

  /** Lets the screen go without the discard prompt, e.g. to the saved campaign. */
  const allowLeave = disablePrevention;

  /** Opens the first invalid step with its error; true when every step is valid. */
  const ensureValid = useCallback(() => {
    for (const [i, s] of steps.entries()) {
      const err = validate(s);
      if (err) {
        goTo(i);
        showError(err);
        return false;
      }
    }
    return true;
  }, [steps, validate, goTo, showError]);

  const stepLabels = useMemo(() => steps.map((s) => t(`${i18nPrefix}.step.${s}.label`)), [steps, i18nPrefix, t]);

  return {
    step,
    index,
    isLast: index === lastIndex,
    stepLabels,
    heading: t(`${i18nPrefix}.step.${step}.title`),
    hint: t(`${i18nPrefix}.step.${step}.hint`),
    nextLabel: index === lastIndex - 1 ? t('gameWizard.toReview') : t('gameWizard.next'),
    scrollRef,
    goTo,
    next,
    back,
    ensureValid,
    allowLeave,
  };
}

/** Header, step progress, one question per screen and a fixed footer. */
export function WizardShell({ title, onBack, stepLabels, index, heading, hint, scrollRef, footer, children }: {
  title: string;
  onBack: () => void;
  stepLabels: string[];
  index: number;
  heading: string;
  hint: string;
  scrollRef: React.RefObject<ScrollView | null>;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const insets = useSafeAreaInsets();
  const total = stepLabels.length;
  const stepOf = t('gameWizard.stepOf', { n: index + 1, total });

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={title} onBack={onBack} />

      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${stepOf}, ${stepLabels[index]}`}
        accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      >
        <View style={[styles.bar, { flexDirection: row }]}>
          {stepLabels.map((label, i) => (
            <View key={label} style={[styles.segment, { backgroundColor: i <= index ? theme.primary : theme.bgInput }]} />
          ))}
        </View>
        <Text style={[styles.stepOf, { color: theme.textMuted, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {stepOf}
          <Text style={{ color: theme.textSecondary }}> · {stepLabels[index]}</Text>
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={[styles.heading, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {heading}
          </Text>
          <Text style={[styles.hint, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
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

/** Full-screen spinner while the saved campaign loads. */
export function WizardLoading() {
  const theme = useTheme();
  return (
    <View style={[styles.container, styles.center, { backgroundColor: theme.bg }]}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

/** Header and a message shown instead of the wizard (no access, load error, not editable). */
export function WizardMessage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={title} onBack={onBack} />
      {children}
    </View>
  );
}

/** "Back" (or a secondary action) next to the main action; each takes half the width. */
export function WizardFooter({ onBack, secondary, primary }: {
  onBack?: () => void;
  secondary?: ButtonProps;
  primary: ButtonProps;
}) {
  const { t } = useLanguage();
  const { row } = useDir();
  return (
    <View style={[styles.footerRow, { flexDirection: row }]}>
      {secondary ? (
        <Button variant="secondary" {...secondary} style={styles.flex} />
      ) : onBack ? (
        <Button variant="secondary" label={t('gameWizard.back')} onPress={onBack} style={styles.flex} />
      ) : null}
      <Button {...primary} style={styles.flex} />
    </View>
  );
}

/** Short explanation under a title or a choice. */
export function HelpText({ text, tone = 'muted', center }: { text: string; tone?: 'muted' | 'secondary'; center?: boolean }) {
  const theme = useTheme();
  const { textAlign } = useDir();
  return (
    <Text
      style={[styles.help, { color: tone === 'muted' ? theme.textMuted : theme.textSecondary, textAlign: center ? 'center' : textAlign }]}
      maxFontSizeMultiplier={1.4}
    >
      {text}
    </Text>
  );
}

/** One step of the final summary, with a link back to that step. */
export function ReviewBlock({ label, onEdit, last, children }: {
  label: string;
  onEdit: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  return (
    <View style={[styles.review, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderLight, paddingBottom: 12 }]}>
      <View style={[styles.reviewHead, { flexDirection: row }]}>
        <Text style={[styles.reviewLabel, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <TouchableOpacity
          onPress={onEdit}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${t('gameWizard.edit')}, ${label}`}
          style={[styles.editLink, { flexDirection: row }]}
        >
          <Pencil size={14} color={theme.primary} strokeWidth={icon.strokeSmall} />
          <Text style={[styles.editText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('gameWizard.edit')}</Text>
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

export function ReviewLine({ text, strong }: { text: string; strong?: boolean }) {
  const theme = useTheme();
  const { textAlign } = useDir();
  return (
    <Text
      style={[strong ? styles.reviewMain : styles.reviewLine, { color: strong ? theme.text : theme.textSecondary, textAlign }]}
      maxFontSizeMultiplier={1.3}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  progress: { paddingHorizontal: 20, paddingBottom: 6, gap: 8 },
  bar: { gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  stepOf: { fontSize: ms(12), fontFamily: font.medium },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  intro: { gap: 4, paddingHorizontal: 4, marginBottom: 2 },
  heading: { fontSize: ms(20), lineHeight: ms(27), fontFamily: font.bold, letterSpacing: -0.3 },
  hint: { fontSize: ms(14), lineHeight: ms(21), fontFamily: font.regular },
  help: { fontSize: ms(12), lineHeight: ms(18), fontFamily: font.regular },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRow: { gap: 10 },
  review: { gap: 4 },
  reviewHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reviewLabel: { flexShrink: 1, fontSize: ms(12), fontFamily: font.semibold },
  reviewMain: { fontSize: ms(15), fontFamily: font.semibold, lineHeight: ms(20) },
  reviewLine: { fontSize: ms(13), fontFamily: font.regular, lineHeight: ms(19) },
  editLink: { alignItems: 'center', gap: 4, minHeight: 32 },
  editText: { fontSize: ms(13), fontFamily: font.semibold },
});
