import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { Check, ChevronDown, ChevronRight, ChevronUp, Play } from 'lucide-react-native';
import { JitLock, JitSettings } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import PromoSheet, { useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { ProgressBar } from '@/components/ui/SummaryCard';
import type { GuideProgress, GuideStepId, GuideStepState } from '@/components/home/useGuideProgress';
import { GUIDE_STEP_META as STEP_META, guideStepKey, type GuideStepPart as StepPart } from '@/components/home/guideSteps';

interface JitPlusGuideSheetProps {
  visible: boolean;
  /** Computed by the caller (HomeGuide), which also uses it outside the sheet. */
  progress: GuideProgress;
  onClose: () => void;
  /** Runs the action of a step (navigate, open the sharing tools…). */
  onStepAction: (id: GuideStepId) => void;
  /** Opens the list of demo videos. */
  onOpenDemos: () => void;
  /** Reopens the page-by-page setup wizard; omitted once the onboarding is completed. */
  onResumeSetup?: () => void;
}

interface StepRowProps {
  step: GuideStepState;
  first: boolean;
  isNext: boolean;
  open: boolean;
  stepText: (id: GuideStepId, part: StepPart) => string;
  onToggle: (id: GuideStepId) => void;
  onAction: (id: GuideStepId) => void;
}

/**
 * One step, as a single line: its icon (a check once done) and its title.
 * Tapping it unfolds the explanation and the link to the screen where it is done.
 */
function StepRow({ step, first, isNext, open, stepText, onToggle, onAction }: StepRowProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const { hairline, muted } = useSheetColors();
  const { Icon } = STEP_META[step.id];
  const title = stepText(step.id, 'Title');
  const cta = stepText(step.id, 'Cta');
  const Chevron = open ? ChevronUp : ChevronDown;

  const marker = step.done ? (
    <View style={[styles.marker, styles.markerOutline, { borderColor: theme.success }]}>
      <Check size={18} color={theme.success} strokeWidth={icon.strokeSmall} />
    </View>
  ) : step.locked ? (
    <View style={[styles.marker, styles.markerOutline, { borderColor: theme.border }]}>
      <JitLock size={16} color={muted} strokeWidth={icon.strokeSmall} />
    </View>
  ) : (
    <View style={[styles.marker, { backgroundColor: isNext ? theme.primary : theme.primaryBg }]}>
      <Icon size={18} color={isNext ? '#FFFFFF' : theme.primary} strokeWidth={icon.stroke} />
    </View>
  );

  const heading = (
    <View style={styles.stepHeading}>
      {isNext ? (
        <Text style={[styles.nextTag, { color: theme.primary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.2}>
          {t('home.guideStatusNext')}
        </Text>
      ) : null}
      <Text
        style={[styles.stepTitle, { color: step.done ? muted : theme.text, textAlign: dir.textAlign }]}
        maxFontSizeMultiplier={1.3}
      >
        {title}
      </Text>
      {step.locked ? (
        <Text style={[styles.lockedText, { color: muted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
          {t('home.guideLocked')}
        </Text>
      ) : null}
    </View>
  );

  const border = !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline };

  // A team member cannot act on an owner's step: nothing to unfold.
  if (step.locked) {
    return (
      <View style={[styles.step, styles.stepLocked, { flexDirection: dir.row }, border]}>
        {marker}
        {heading}
      </View>
    );
  }

  return (
    <View style={border}>
      <TouchableOpacity
        onPress={() => onToggle(step.id)}
        activeOpacity={0.7}
        style={[styles.step, { flexDirection: dir.row }]}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open, checked: step.done }}
      >
        {marker}
        {heading}
        <Chevron size={18} color={muted} strokeWidth={icon.stroke} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.stepDetail}>
          <Text style={[styles.stepText, { color: muted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
            {stepText(step.id, 'Text')}
          </Text>
          <TouchableOpacity
            onPress={() => onAction(step.id)}
            activeOpacity={0.7}
            hitSlop={LINK_HIT_SLOP}
            style={[styles.link, { flexDirection: dir.row, alignSelf: dir.alignStart }]}
            accessibilityRole="button"
            accessibilityLabel={step.done ? `${t('home.guideRedo')} : ${cta}` : cta}
          >
            <Text style={[styles.linkText, { color: step.done ? theme.textSecondary : theme.primary }]} maxFontSizeMultiplier={1.25}>
              {step.done ? t('home.guideRedo') : cta}
            </Text>
            <ChevronRight
              size={14}
              color={step.done ? theme.textSecondary : theme.primary}
              strokeWidth={icon.strokeSmall}
              style={dir.flip}
            />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** A "go further" row: plain icon, title and one line of explanation. */
function MoreRow({ Icon, title, text, first, onPress }: {
  Icon: LucideIcon;
  title: string;
  text: string;
  first: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const dir = useDir();
  const { hairline, muted } = useSheetColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.more,
        { flexDirection: dir.row },
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
    >
      <Icon size={22} color={theme.text} strokeWidth={icon.stroke} />
      <View style={styles.flex1}>
        <Text style={[styles.stepTitle, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={[styles.moreText, { color: muted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>{text}</Text>
      </View>
      <ChevronRight size={18} color={muted} strokeWidth={icon.stroke} style={dir.flip} />
    </TouchableOpacity>
  );
}

/**
 * "Guide de départ": one-minute steps from creating the loyalty card to
 * bringing customers back. Each step is ticked from the merchant's real data
 * and shows as a single line; only one is unfolded at a time (the next one to
 * do by default), with its explanation and the link to the screen where it is
 * done. The video tutorials stay available as an extra. White sheet, same
 * bordered cards as Accueil.
 */
function JitPlusGuideSheet({ visible, progress, onClose, onStepAction, onOpenDemos, onResumeSetup }: JitPlusGuideSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const ratio = progress.total > 0 ? progress.doneCount / progress.total : 0;
  const { nextId } = progress;
  const card = { backgroundColor: theme.bgCard, borderColor: theme.border };

  const stepText = (id: GuideStepId, part: StepPart) => t(guideStepKey(id, part));

  // Step unfolded by the merchant; `undefined` until they touch one, which
  // leaves the next step to do open. Reset each time the sheet opens.
  const [picked, setPicked] = useState<GuideStepId | null | undefined>(undefined);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPicked(undefined);
  }
  const openId = picked === undefined ? nextId : picked;
  const toggleStep = useCallback(
    (id: GuideStepId) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPicked(id === openId ? null : id);
    },
    [openId],
  );

  const cta = nextId
    ? { label: t('home.guideNextCta', { action: stepText(nextId, 'Cta') }), Icon: STEP_META[nextId].Icon, onPress: () => onStepAction(nextId) }
    : { label: t('home.guideDemosCta'), Icon: Play, onPress: onOpenDemos };

  const heroFooter = (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: progress.total, now: progress.doneCount }}
    >
      <Text style={[styles.progressText, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.25}>
        {progress.allDone
          ? t('home.guideAllDone')
          : t('home.guideProgress', { done: progress.doneCount, total: progress.total })}
      </Text>
      <ProgressBar ratio={ratio} />
    </View>
  );

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone="violet"
      plain
      heroLabel={t('home.setupLabel')}
      title={t('home.promoGuideTitle')}
      subtitle={t('home.guideHeroSubtitle')}
      heroFooter={heroFooter}
      cta={cta}
    >
      <Text style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
        {t('home.guideStepsLabel')}
      </Text>
      <View style={[styles.card, card]}>
        {progress.steps.map((s, i) => (
          <StepRow
            key={s.id}
            step={s}
            first={i === 0}
            isNext={s.id === nextId}
            open={s.id === openId}
            stepText={stepText}
            onToggle={toggleStep}
            onAction={onStepAction}
          />
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
        {t('home.guideMoreLabel')}
      </Text>
      <View style={[styles.card, card]}>
        <MoreRow Icon={Play} title={t('home.qaDemos')} text={t('home.toolDemosHint')} first onPress={onOpenDemos} />
        {onResumeSetup && (
          <MoreRow
            Icon={JitSettings}
            title={t('home.setupResumeTitle')}
            text={t('home.setupResumeCta')}
            first={false}
            onPress={onResumeSetup}
          />
        )}
      </View>
    </PromoSheet>
  );
}

export default React.memo(JitPlusGuideSheet);

const LINK_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const MARKER_SIZE = 36;

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  progress: { marginTop: 16, gap: 8 },
  progressText: { fontSize: 13, fontFamily: font.semibold },

  // Same section title and card as "Mes outils" on Accueil.
  sectionTitle: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3, marginTop: 18, marginBottom: 10 },
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },

  step: { alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  stepLocked: { opacity: 0.7 },
  marker: { width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: MARKER_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  markerOutline: { borderWidth: 1.5 },
  stepHeading: { flex: 1, gap: 2 },
  // Aligned with the title, under the marker column.
  stepDetail: { paddingStart: 14 + MARKER_SIZE + 12, paddingEnd: 14, paddingBottom: 14, marginTop: -2 },
  nextTag: { fontSize: 12, fontFamily: font.semibold },
  stepTitle: { fontSize: 15, lineHeight: 20, fontFamily: font.semibold, letterSpacing: -0.2 },
  stepText: { fontSize: 13, lineHeight: 19, fontFamily: font.regular },
  link: { alignItems: 'center', gap: 2, marginTop: 8 },
  linkText: { fontSize: 13, fontFamily: font.semibold },
  lockedText: { fontSize: 12, fontFamily: font.medium },

  more: { alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14 },
  moreText: { fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: font.regular },
});
