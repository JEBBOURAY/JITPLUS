import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, I18nManager } from 'react-native';
import {
  Check,
  Clock,
  Compass,
  ChevronRight,
} from 'lucide-react-native';
import { JitLock, JitStar } from '@/components/icons';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PromoSheet, { SheetSectionLabel, useSheetColors } from '@/components/home/PromoSheet';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';
import { useGuideProgress, type GuideStepId, type GuideStepState } from '@/components/home/useGuideProgress';
import { GUIDE_STEP_META as STEP_META, guideStepKey, type GuideStepPart as StepPart } from '@/components/home/guideSteps';

const TONE: PromoTone = 'violet';
const ACCENT = PROMO_TONES[TONE].fill;
const DONE = PROMO_TONES.emerald.fill;
const GOLD = palette.gold;

interface JitPlusGuideSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Runs the action of a step (navigate, open the sharing tools…). */
  onStepAction: (id: GuideStepId) => void;
  onStartTour: () => void;
}

interface StepRowProps {
  step: GuideStepState;
  index: number;
  last: boolean;
  isNext: boolean;
  stepText: (id: GuideStepId, part: StepPart) => string;
  onAction: (id: GuideStepId) => void;
}

function StepRow({ step, index, last, isNext, stepText, onAction }: StepRowProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { surface, softFill, hairline, muted, ink } = useSheetColors();
  const isRTL = I18nManager.isRTL;
  const meta = STEP_META[step.id];
  const idle = theme.mode === 'dark' ? 'rgba(255,255,255,0.14)' : '#E2E8F0';
  const railColor = step.done ? DONE : isNext ? ACCENT : idle;
  const actionColor = isNext ? '#FFFFFF' : step.done ? theme.textSecondary : ink(TONE);
  const cta = stepText(step.id, 'Cta');

  return (
    <View style={[styles.stepRow, isRTL && styles.rowRtl]}>
      <View style={styles.stepRail}>
        <View
          style={[
            styles.stepDot,
            { borderColor: railColor, backgroundColor: step.done || isNext ? railColor : surface },
          ]}
        >
          {step.done ? (
            <Check size={13} color="#FFFFFF" strokeWidth={3} />
          ) : step.locked ? (
            <JitLock size={11} color={muted} strokeWidth={2.4} />
          ) : (
            <Text style={[styles.stepDotText, { color: isNext ? '#FFFFFF' : muted }]} maxFontSizeMultiplier={1.1}>
              {index + 1}
            </Text>
          )}
        </View>
        {!last ? <View style={[styles.stepConnector, { backgroundColor: step.done ? `${DONE}66` : hairline }]} /> : null}
      </View>

      <View
        style={[
          styles.stepCard,
          { backgroundColor: softFill, borderColor: hairline },
          isNext && styles.stepCardNext,
          step.locked && styles.stepCardLocked,
        ]}
      >
        <View style={[styles.stepHead, isRTL && styles.rowRtl]}>
          <View style={[styles.stepIcon, { backgroundColor: `${PROMO_TONES[meta.tone].fill}1A` }]}>
            <meta.Icon size={15} color={ink(meta.tone)} strokeWidth={2.2} />
          </View>
          <Text style={[styles.stepTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {stepText(step.id, 'Title')}
          </Text>
          {step.done ? (
            <View style={[styles.pill, styles.pillDone]}>
              <Text style={[styles.pillText, { color: ink('emerald') }]} maxFontSizeMultiplier={1.15}>{t('home.guideStatusDone')}</Text>
            </View>
          ) : (
            <View style={[styles.pill, isRTL && styles.rowRtl, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#EEF2F7' }]}>
              <Clock size={10} color={theme.textSecondary} strokeWidth={2.4} />
              <Text style={[styles.pillText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.15}>{t('home.guideStepDuration')}</Text>
            </View>
          )}
        </View>

        {isNext ? (
          <Text style={[styles.nextTag, { color: ink(TONE) }]} maxFontSizeMultiplier={1.2}>
            {t('home.guideStatusNext').toUpperCase()}
          </Text>
        ) : null}

        <Text style={[styles.stepText, { color: muted }]} maxFontSizeMultiplier={1.4}>
          {stepText(step.id, 'Text')}
        </Text>

        {step.locked ? (
          <View style={[styles.lockedRow, isRTL && styles.rowRtl]}>
            <JitLock size={12} color={muted} strokeWidth={2.2} />
            <Text style={[styles.lockedText, { color: muted }]} maxFontSizeMultiplier={1.3}>
              {t('home.guideLocked')}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => onAction(step.id)}
            activeOpacity={0.8}
            style={[
              styles.stepAction,
              isRTL && styles.rowRtl,
              isNext
                ? styles.stepActionNext
                : { borderColor: step.done ? hairline : `${ACCENT}55` },
            ]}
            accessibilityRole="button"
            accessibilityLabel={step.done ? `${t('home.guideRedo')} : ${cta}` : cta}
          >
            <Text style={[styles.stepActionText, { color: actionColor }]} maxFontSizeMultiplier={1.25}>
              {step.done ? t('home.guideRedo') : cta}
            </Text>
            <ChevronRight size={14} color={actionColor} strokeWidth={2.4} style={isRTL ? styles.flipX : undefined} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * "Maîtrisez JitPlus en 5 minutes": one-minute steps from creating the
 * loyalty card to bringing customers back. Each step is ticked from the
 * merchant's real data and links straight to the screen where it is done; the
 * guided tour of the Accueil stays available as an extra.
 */
function JitPlusGuideSheet({ visible, onClose, onStepAction, onStartTour }: JitPlusGuideSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const isRTL = I18nManager.isRTL;
  const progress = useGuideProgress(visible);
  const ratio = progress.total > 0 ? progress.doneCount / progress.total : 0;
  const { nextId } = progress;

  const stepText = (id: GuideStepId, part: StepPart) => t(guideStepKey(id, part));

  const cta = nextId
    ? { label: t('home.guideNextCta', { action: stepText(nextId, 'Cta') }), Icon: STEP_META[nextId].Icon, onPress: () => onStepAction(nextId) }
    : { label: t('home.guideTourCta'), Icon: Compass, onPress: onStartTour };

  const heroFooter = (
    <View
      style={styles.progressBox}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: progress.total, now: progress.doneCount }}
    >
      <View style={[styles.progressHead, isRTL && styles.rowRtl]}>
        {progress.allDone ? <JitStar size={14} color={GOLD} strokeWidth={2.2} /> : null}
        <Text style={styles.progressText} maxFontSizeMultiplier={1.25}>
          {progress.allDone
            ? t('home.guideAllDone')
            : t('home.guideProgress', { done: progress.doneCount, total: progress.total })}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </View>
  );

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.guideHeroLabel')}
      title={t('home.promoGuideTitle')}
      subtitle={t('home.guideHeroSubtitle')}
      heroBadge={<Image source={require('@/assets/images/jitplusprologo.png')} style={styles.heroLogo} resizeMode="contain" />}
      heroFooter={heroFooter}
      cta={cta}
    >
      <SheetSectionLabel text={t('home.guideStepsLabel')} tone={TONE} />
      {progress.steps.map((s, i) => (
        <StepRow
          key={s.id}
          step={s}
          index={i}
          last={i === progress.steps.length - 1}
          isNext={s.id === nextId}
          stepText={stepText}
          onAction={onStepAction}
        />
      ))}

      <SheetSectionLabel text={t('home.guideMoreLabel')} tone={TONE} />
      <TouchableOpacity
        onPress={onStartTour}
        activeOpacity={0.85}
        style={[styles.tourCard, isRTL && styles.rowRtl, { backgroundColor: softFill, borderColor: hairline }]}
        accessibilityRole="button"
        accessibilityLabel={t('home.guideTourTitle')}
      >
        <View style={styles.tourIcon}>
          <Compass size={18} color={ink(TONE)} strokeWidth={2.2} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.tourTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {t('home.guideTourTitle')}
          </Text>
          <Text style={[styles.tourText, { color: muted }]} maxFontSizeMultiplier={1.4}>
            {t('home.guideTourText')}
          </Text>
        </View>
        <ChevronRight size={16} color={muted} strokeWidth={2.2} style={isRTL ? styles.flipX : undefined} />
      </TouchableOpacity>
    </PromoSheet>
  );
}

export default React.memo(JitPlusGuideSheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  flipX: { transform: [{ scaleX: -1 }] },
  flex1: { flex: 1 },
  heroLogo: { width: 34, height: 34 },

  progressBox: {
    marginTop: 16,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressText: { color: '#FFFFFF', fontSize: 12.5, fontFamily: 'Lexend_600SemiBold', flexShrink: 1 },
  progressTrack: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: GOLD },

  // Steps timeline
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { width: 26, alignItems: 'center' },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  stepDotText: { fontSize: 12, fontFamily: 'Lexend_700Bold' },
  stepConnector: { flex: 1, width: 2, borderRadius: 1, marginTop: 4, marginBottom: -8 },
  stepCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 13, marginBottom: 10 },
  stepCardNext: { backgroundColor: `${ACCENT}0D`, borderColor: `${ACCENT}55` },
  stepCardLocked: { opacity: 0.7 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { flex: 1, fontSize: 13.5, lineHeight: 18, fontFamily: 'Lexend_600SemiBold' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillDone: { backgroundColor: `${DONE}1A` },
  pillText: { fontSize: 10.5, fontFamily: 'Lexend_600SemiBold' },
  nextTag: { fontSize: 9.5, letterSpacing: 1, fontFamily: 'Lexend_700Bold', marginTop: 8 },
  stepText: { fontSize: 12, lineHeight: 17.5, marginTop: 6, fontFamily: 'Lexend_400Regular' },
  stepAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  stepActionNext: { backgroundColor: ACCENT, borderColor: ACCENT },
  stepActionText: { fontSize: 12, fontFamily: 'Lexend_600SemiBold' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  lockedText: { fontSize: 11.5, fontFamily: 'Lexend_500Medium', flexShrink: 1 },

  // Guided tour
  tourCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 13 },
  tourIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}1A`,
  },
  tourTitle: { fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },
  tourText: { fontSize: 11.5, lineHeight: 16.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },
});
