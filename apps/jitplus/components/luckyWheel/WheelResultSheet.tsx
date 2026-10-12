import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, Gift, RotateCcw, Store, Trophy } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { LuckyWheelDrawResult } from '@/types';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';
import ConfettiBurst from './ConfettiBurst';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  result: LuckyWheelDrawResult;
  merchantName: string;
  remainingTickets: number;
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
  result, merchantName, remainingTickets, localeTag, bottomInset, theme, fonts, t, onReplay, onClose, onViewPrizes, onDismiss,
}: Props) {
  const [fade] = useState(() => new Animated.Value(0));
  const [slide] = useState(() => new Animated.Value(1));
  const [pop] = useState(() => new Animated.Value(0.5));
  const won = result.result === 'WON';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, damping: 18, stiffness: 170, mass: 0.9, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(pop, { toValue: 1, damping: 8, stiffness: 160, useNativeDriver: true }),
      ]),
    ]).start();
  }, [fade, slide, pop]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, hp(420)] });
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
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss ?? onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      {won && <ConfettiBurst play />}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.bgCard, paddingBottom: Math.max(bottomInset, hp(16)) + hp(8), transform: [{ translateY }] },
        ]}
        accessibilityViewIsModal
        accessibilityLiveRegion="assertive"
      >
        <View style={[styles.handle, { backgroundColor: theme.border }]} />

        <Animated.View style={{ transform: [{ scale: pop }] }}>
          {won ? (
            <LinearGradient colors={[palette.goldLight, palette.goldDark]} style={styles.badge}>
              <Trophy size={ms(40)} color="#fff" strokeWidth={2} />
            </LinearGradient>
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
          <LinearGradient colors={[palette.violetVivid, palette.violetDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            <Text style={[styles.primaryText, { fontFamily: fonts.bold }]}>{primaryLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {(remainingTickets > 0 || won) && (
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.secondary} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: theme.textMuted, fontFamily: fonts.semibold }]}>{t('luckyWheel.close')}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(5,2,12,0.55)', justifyContent: 'flex-end', zIndex: 20 },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(22),
    paddingTop: hp(10),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 24,
  },
  handle: { width: ms(40), height: 4, borderRadius: 2, marginBottom: hp(18) },
  badge: { width: ms(84), height: ms(84), borderRadius: ms(42), alignItems: 'center', justifyContent: 'center', marginBottom: hp(14) },
  kicker: { fontSize: FS.sm, textTransform: 'uppercase', letterSpacing: 1.2, textAlign: 'center' },
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
