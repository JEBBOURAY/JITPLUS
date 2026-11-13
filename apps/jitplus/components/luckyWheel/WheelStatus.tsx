import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { RefreshCw, Ticket } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';

import type { AppFonts } from '@/utils/fonts';
import { GameStateCard } from '../GameStage';

interface Props {
  isLoading: boolean;
  isError: boolean;
  hasCampaign: boolean;
  hasPlayable: boolean;
  pendingCount: number;
  spinning: boolean;
  spinsLeft: number;
  canSpin: boolean;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onRetry: () => Promise<unknown>;
  onOpenHistory: () => void;
  onSpin: () => void;
}

/** Loading / error / no-ticket states, or the spin CTA once a wheel is playable. */
export default React.memo(function WheelStatus({
  isLoading, isError, hasCampaign, hasPlayable, pendingCount, spinning, spinsLeft, canSpin, fonts, t,
  onRetry, onOpenHistory, onSpin,
}: Props) {
  if (isLoading && !hasCampaign) {
    return <ActivityIndicator color={palette.goldLight} style={{ marginTop: hp(28) }} />;
  }
  if (isError && !hasCampaign) {
    return (
      <GameStateCard
        title={t('luckyWheel.loadError')}
        action={{ label: t('common.retry'), onPress: () => { void onRetry(); }, Icon: RefreshCw }}
        style={styles.stateCard}
        fonts={fonts}
      />
    );
  }
  if (!hasPlayable) {
    return (
      <GameStateCard
        Icon={Ticket}
        title={t('luckyWheel.noTickets')}
        hint={t('luckyWheel.noTicketsHint')}
        action={pendingCount > 0
          ? { label: t('luckyWheel.viewPrizes'), onPress: onOpenHistory, badge: pendingCount }
          : undefined}
        style={styles.stateCard}
        fonts={fonts}
      />
    );
  }
  return (
    <View style={styles.ctaBlock}>
      <View style={styles.spinsRow}>
        {spinning ? (
          <Text style={[styles.spinningText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.spinning')}</Text>
        ) : (
          <View style={styles.spinsPill}>
            <Ticket size={ms(14)} color={palette.goldLight} strokeWidth={2} />
            <Text style={[styles.spinsText, { fontFamily: fonts.semibold }]}>
              {spinsLeft === 1 ? t('luckyWheel.spinsLeftOne') : t('luckyWheel.spinsLeftOther', { count: spinsLeft })}
            </Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        onPress={onSpin}
        disabled={!canSpin}
        activeOpacity={0.85}
        style={[styles.spinBtnWrap, !canSpin && styles.spinBtnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t('luckyWheel.spinCta')}
        accessibilityState={{ disabled: !canSpin, busy: spinning }}
      >
        <View style={[styles.spinBtn, { backgroundColor: palette.goldLight }]}>
          {spinning ? (
            <ActivityIndicator color="#3B1D06" />
          ) : (
            <Text style={[styles.spinBtnText, { fontFamily: fonts.bold }]}>{t('luckyWheel.spinCta')}</Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  ctaBlock: { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: wp(24) },
  spinsRow: { height: ms(32), alignItems: 'center', justifyContent: 'center', marginBottom: hp(10) },
  spinsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  spinsText: { color: palette.goldLight, fontSize: FS.sm },
  spinningText: { color: palette.goldLight, fontSize: FS.md },
  spinBtnWrap: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  spinBtnDisabled: { opacity: 0.55 },
  spinBtn: { height: ms(56), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  spinBtnText: { color: '#3B1D06', fontSize: FS.lg, letterSpacing: 0.2 },

  stateCard: { marginHorizontal: wp(24) },
});
