import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, I18nManager } from 'react-native';
import { ChevronRight, Compass } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';
import { GUIDE_STEP_META, guideStepKey } from '@/components/home/guideSteps';
import type { GuideProgress, GuideStepId } from '@/components/home/useGuideProgress';

const ACCENT = PROMO_TONES.violet.fill;

interface Props {
  progress: GuideProgress;
  /** Opens the full step list. */
  onOpen: () => void;
  /** Runs the next step's action directly. */
  onStepAction: (id: GuideStepId) => void;
}

/**
 * Accueil "Démarrage x/7" card: the single onboarding entry point while the
 * setup guide is not finished. Shows the progress and the one next step.
 */
function SetupChecklistCard({ progress, onOpen, onStepAction }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const isRTL = I18nManager.isRTL;
  const { nextId, doneCount, total } = progress;
  const ratio = total > 0 ? doneCount / total : 0;
  const progressLabel = t('home.guideProgress', { done: doneCount, total });
  const NextIcon = nextId ? GUIDE_STEP_META[nextId].Icon : Compass;
  const ink = (tone: PromoTone) => (theme.mode === 'dark' ? PROMO_TONES[tone].dark : PROMO_TONES[tone].light);

  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.9}
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${t('home.setupLabel')}. ${progressLabel}. ${t('home.setupSeeAll')}`}
    >
      <View style={[styles.head, isRTL && styles.rowRtl]}>
        <View style={styles.headIcon}>
          <Compass size={18} color={ink('violet')} strokeWidth={2.2} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.label, { color: ink('violet') }]} maxFontSizeMultiplier={1.2}>
            {t('home.setupLabel').toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {progressLabel}
          </Text>
        </View>
        <Text style={[styles.seeAll, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
          {t('home.setupSeeAll')}
        </Text>
        <ChevronRight size={16} color={theme.textSecondary} strokeWidth={2.2} style={isRTL ? styles.flipX : undefined} />
      </View>

      <View
        style={[styles.track, { backgroundColor: theme.border }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: doneCount }}
      >
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>

      {nextId ? (
        <View style={[styles.next, { borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}0D` }]}>
          <View style={[styles.nextHead, isRTL && styles.rowRtl]}>
            <View style={[styles.nextIcon, { backgroundColor: `${PROMO_TONES[GUIDE_STEP_META[nextId].tone].fill}1A` }]}>
              <NextIcon size={15} color={ink(GUIDE_STEP_META[nextId].tone)} strokeWidth={2.2} />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.nextTag, { color: ink('violet') }]} maxFontSizeMultiplier={1.2}>
                {t('home.guideStatusNext').toUpperCase()}
              </Text>
              <Text style={[styles.nextTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                {t(guideStepKey(nextId, 'Title'))}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => onStepAction(nextId)}
            activeOpacity={0.85}
            style={[styles.cta, isRTL && styles.rowRtl]}
            accessibilityRole="button"
            accessibilityLabel={t(guideStepKey(nextId, 'Cta'))}
          >
            <Text style={styles.ctaText} maxFontSizeMultiplier={1.25}>
              {t(guideStepKey(nextId, 'Cta'))}
            </Text>
            <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.4} style={isRTL ? styles.flipX : undefined} />
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default React.memo(SetupChecklistCard);

const styles = StyleSheet.create({
  card: { marginTop: 14, borderRadius: 18, borderWidth: 1, padding: 14 },
  rowRtl: { flexDirection: 'row-reverse' },
  flipX: { transform: [{ scaleX: -1 }] },
  flex1: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}1A`,
  },
  label: { fontSize: 10, letterSpacing: 1, fontFamily: 'Lexend_700Bold' },
  title: { fontSize: 15, marginTop: 1, fontFamily: 'Lexend_600SemiBold' },
  seeAll: { fontSize: 12, fontFamily: 'Lexend_500Medium' },
  track: { marginTop: 12, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: ACCENT },
  next: { marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  nextTag: { fontSize: 9.5, letterSpacing: 1, fontFamily: 'Lexend_700Bold' },
  nextTitle: { fontSize: 13.5, marginTop: 1, fontFamily: 'Lexend_600SemiBold' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: ACCENT,
  },
  ctaText: { color: '#FFFFFF', fontSize: 12.5, fontFamily: 'Lexend_600SemiBold' },
});
