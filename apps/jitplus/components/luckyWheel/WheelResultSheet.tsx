import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { CalendarClock, Gift, RotateCcw, Store, Trophy } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import BottomSheet from '@/components/BottomSheet';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';
import ConfettiBurst from './ConfettiBurst';
import type { ShownResult } from './useLuckyWheel';

import type { AppFonts } from '@/utils/fonts';

interface Props {
  /** The draw to show; null slides the sheet away. */
  shown: ShownResult | null;
  localeTag: string;
  bottomInset: number;
  theme: ThemeColors;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onReplay: () => void;
  onClose: () => void;
  onViewPrizes: () => void;
  /** Backdrop tap: hides the sheet only. Defaults to `onClose`. */
  onDismiss?: () => void;
}

export default React.memo(function WheelResultSheet({
  shown, localeTag, bottomInset, theme, fonts, t, onReplay, onClose, onViewPrizes, onDismiss,
}: Props) {
  // Keeps the last draw on screen while the sheet slides out.
  const [last, setLast] = useState<ShownResult | null>(shown);
  useEffect(() => { if (shown) setLast(shown); }, [shown]);

  const [pop] = useState(() => new Animated.Value(0.85));
  useEffect(() => {
    if (!shown) return;
    pop.setValue(0.85);
    const anim = Animated.sequence([
      Animated.delay(120),
      Animated.timing(pop, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [shown, pop]);

  if (!last) return null;
  const { data: result, merchantName, remaining: remainingTickets } = last;
  const won = result.result === 'WON';
  const claimBefore = won && result.draw.claimBefore
    ? new Date(result.draw.claimBefore).toLocaleDateString(localeTag, { day: 'numeric', month: 'long' })
    : null;
  const isDark = theme.mode === 'dark';
  const accent = isDark ? palette.violetLight : palette.violet;

  const primaryLabel = remainingTickets > 0
    ? t('luckyWheel.replayCount', { count: remainingTickets })
    : won ? t('luckyWheel.viewPrizes') : t('luckyWheel.close');
  const onPrimary = remainingTickets > 0 ? onReplay : won ? onViewPrizes : onClose;

  return (
    <BottomSheet
      inline
      visible={!!shown}
      onClose={onDismiss ?? onClose}
      onExited={() => setLast(null)}
      backdropColor="rgba(5,2,12,0.55)"
      backdropLabel={t('common.close')}
      backdropContent={won ? <ConfettiBurst play /> : null}
      handleStyle={styles.handle}
      style={[styles.sheet, { paddingBottom: Math.max(bottomInset, hp(16)) + hp(8) }]}
    >
      <View style={styles.content} accessibilityLiveRegion="assertive">

        <Animated.View style={{ transform: [{ scale: pop }] }}>
          {won ? (
            <View style={[styles.badge, { backgroundColor: palette.goldDark }]}>
              <Trophy size={ms(40)} color="#fff" strokeWidth={2} />
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(148,163,184,0.16)' : '#F1F5F9' }]}>
              <RotateCcw size={ms(36)} color={theme.textMuted} strokeWidth={2} />
            </View>
          )}
        </Animated.View>

        {won ? (
          <>
            <Text style={[styles.kicker, { color: palette.goldDark, fontFamily: fonts.semibold }]}>{t('luckyWheel.resultWon')}</Text>
            <Text style={[styles.prize, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={3}>
              {result.prize.label}
            </Text>
            {!!result.prize.description && (
              <Text style={[styles.desc, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={3}>
                {result.prize.description}
              </Text>
            )}

            <View style={[styles.infoBox, { backgroundColor: isDark ? 'rgba(124,58,237,0.14)' : palette.violetUltraLight }]}>
              <View style={styles.infoRow}>
                <Store size={ms(16)} color={accent} strokeWidth={2} />
                <Text style={[styles.infoText, { color: theme.text, fontFamily: fonts.medium }]}>
                  {t('luckyWheel.claimHow', { merchant: merchantName })}
                </Text>
              </View>
              {claimBefore && (
                <View style={styles.infoRow}>
                  <CalendarClock size={ms(16)} color={palette.goldDark} strokeWidth={2} />
                  <Text style={[styles.infoText, { color: theme.text, fontFamily: fonts.medium }]}>
                    {t('luckyWheel.claimBeforeLong', { date: claimBefore })}
                  </Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Gift size={ms(16)} color={accent} strokeWidth={2} />
                <Text style={[styles.infoText, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
                  {t('luckyWheel.savedInPrizes')}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
              {t('luckyWheel.resultLost')}
            </Text>
            <Text style={[styles.desc, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
              {remainingTickets > 0 ? t('luckyWheel.resultLostDescReplay') : t('luckyWheel.resultLostDesc')}
            </Text>
          </>
        )}

        <TouchableOpacity onPress={onPrimary} activeOpacity={0.85} style={styles.primaryWrap} accessibilityRole="button">
          <View style={[styles.primary, { backgroundColor: palette.violet }]}>
            <Text style={[styles.primaryText, { fontFamily: fonts.bold }]}>{primaryLabel}</Text>
          </View>
        </TouchableOpacity>

        {(remainingTickets > 0 || won) && (
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.secondary} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: theme.textMuted, fontFamily: fonts.semibold }]}>{t('luckyWheel.close')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(22),

    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  handle: { marginBottom: hp(18) },
  content: { alignItems: 'center' },
  badge: { width: ms(84), height: ms(84), borderRadius: ms(42), alignItems: 'center', justifyContent: 'center', marginBottom: hp(14) },
  kicker: { fontSize: FS.sm, textAlign: 'center' },
  prize: { fontSize: FS['2xl'], textAlign: 'center', marginTop: hp(4), letterSpacing: -0.4 },
  title: { fontSize: FS['2xl'], textAlign: 'center', letterSpacing: -0.4 },
  desc: { fontSize: FS.md, textAlign: 'center', marginTop: hp(6), lineHeight: ms(21), paddingHorizontal: wp(8) },
  infoBox: { alignSelf: 'stretch', borderRadius: radius.lg, padding: ms(14), gap: hp(10), marginTop: hp(16) },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: ms(10) },
  infoText: { flex: 1, fontSize: FS.sm, lineHeight: ms(19) },
  primaryWrap: { alignSelf: 'stretch', marginTop: hp(20), borderRadius: radius.lg, overflow: 'hidden' },
  primary: { height: ms(52), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  primaryText: { color: '#fff', fontSize: FS.md },
  secondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: hp(12), marginTop: hp(2) },
  secondaryText: { fontSize: FS.sm },
});
