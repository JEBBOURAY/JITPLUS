import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { CalendarClock, Gift, RotateCcw, Store, Trophy } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import BottomSheet from '@/components/BottomSheet';
import { rewardSheetStyles } from '@/components/rewardSheetStyles';
import { usePopIn } from '@/hooks/usePopIn';
import { hp, ms, fontSize as FS, radius } from '@/utils/responsive';
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

  const pop = usePopIn(!!shown);

  if (!last) return null;
  const { data: result, merchantName, remaining: remainingTickets } = last;
  const won = result.result === 'WON';
  const claimBefore = won && result.draw.claimBefore
    ? new Date(result.draw.claimBefore).toLocaleDateString(localeTag, { day: 'numeric', month: 'long' })
    : null;
  const isDark = theme.mode === 'dark';
  const accent = theme.primary;

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
      handleStyle={rewardSheetStyles.handle}
      style={[rewardSheetStyles.sheet, { paddingBottom: Math.max(bottomInset, hp(16)) + hp(8) }]}
    >
      <View style={rewardSheetStyles.content} accessibilityLiveRegion="assertive">

        <Animated.View style={{ transform: [{ scale: pop }] }}>
          {won ? (
            <View style={[rewardSheetStyles.badge, { backgroundColor: palette.goldDark }]}>
              <Trophy size={ms(40)} color="#fff" strokeWidth={2} />
            </View>
          ) : (
            <View style={[rewardSheetStyles.badge, { backgroundColor: isDark ? 'rgba(148,163,184,0.16)' : '#F1F5F9' }]}>
              <RotateCcw size={ms(36)} color={theme.textMuted} strokeWidth={2} />
            </View>
          )}
        </Animated.View>

        {won ? (
          <>
            <Text style={[rewardSheetStyles.kicker, { color: palette.goldDark, fontFamily: fonts.semibold }]}>{t('luckyWheel.resultWon')}</Text>
            <Text style={[styles.prize, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={3}>
              {result.prize.label}
            </Text>
            {!!result.prize.description && (
              <Text style={[rewardSheetStyles.desc, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={3}>
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
            <Text style={[rewardSheetStyles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
              {t('luckyWheel.resultLost')}
            </Text>
            <Text style={[rewardSheetStyles.desc, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
              {remainingTickets > 0 ? t('luckyWheel.resultLostDescReplay') : t('luckyWheel.resultLostDesc')}
            </Text>
          </>
        )}

        <TouchableOpacity onPress={onPrimary} activeOpacity={0.85} style={rewardSheetStyles.primaryWrap} accessibilityRole="button">
          <View style={[rewardSheetStyles.primary, { backgroundColor: palette.violet }]}>
            <Text style={[rewardSheetStyles.primaryText, { fontFamily: fonts.bold }]}>{primaryLabel}</Text>
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
  prize: { fontSize: FS['2xl'], textAlign: 'center', marginTop: hp(4), letterSpacing: -0.4 },
  infoBox: { alignSelf: 'stretch', borderRadius: radius.lg, padding: ms(14), gap: hp(10), marginTop: hp(16) },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: ms(10) },
  infoText: { flex: 1, fontSize: FS.sm, lineHeight: ms(19) },
  secondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: hp(12), marginTop: hp(2) },
  secondaryText: { fontSize: FS.sm },
});
