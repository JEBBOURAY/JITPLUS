import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw, Ticket } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

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
      <View style={styles.stateCard}>
        <Text style={[styles.stateTitle, { fontFamily: fonts.bold }]}>{t('luckyWheel.loadError')}</Text>
        <TouchableOpacity onPress={() => { void onRetry(); }} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
          <RefreshCw size={ms(16)} color="#fff" strokeWidth={2} />
          <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!hasPlayable) {
    return (
      <View style={styles.stateCard}>
        <View style={styles.stateIcon}>
          <Ticket size={ms(26)} color={palette.goldLight} strokeWidth={1.8} />
        </View>
        <Text style={[styles.stateTitle, { fontFamily: fonts.bold }]}>{t('luckyWheel.noTickets')}</Text>
        <Text style={[styles.stateHint, { fontFamily: fonts.regular }]}>{t('luckyWheel.noTicketsHint')}</Text>
        {pendingCount > 0 && (
          <TouchableOpacity onPress={onOpenHistory} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
            <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.viewPrizes')}</Text>
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { fontFamily: fonts.bold }]}>{pendingCount}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
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
        <LinearGradient
          colors={[palette.goldSoft, palette.goldLight, palette.goldDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.spinBtn}
        >
          {spinning ? (
            <ActivityIndicator color="#3B1D06" />
          ) : (
            <Text style={[styles.spinBtnText, { fontFamily: fonts.bold }]}>{t('luckyWheel.spinCta')}</Text>
          )}
        </LinearGradient>
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
    shadowColor: palette.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  spinBtnDisabled: { opacity: 0.55 },
  spinBtn: { height: ms(56), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  spinBtnText: { color: '#3B1D06', fontSize: FS.lg, letterSpacing: 0.2 },

  stateCard: {
    alignSelf: 'stretch',
    marginHorizontal: wp(24),
    alignItems: 'center',
    gap: hp(8),
    paddingVertical: hp(18),
    paddingHorizontal: wp(20),
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  stateIcon: {
    width: ms(52),
    height: ms(52),
    borderRadius: ms(26),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)',
    marginBottom: hp(2),
  },
  stateTitle: { color: '#fff', fontSize: FS.lg, textAlign: 'center' },
  stateHint: { color: 'rgba(255,255,255,0.6)', fontSize: FS.sm, textAlign: 'center', lineHeight: ms(20) },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    marginTop: hp(6),
    paddingHorizontal: ms(16),
    height: ms(42),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ghostBtnText: { color: '#fff', fontSize: FS.sm },
  badge: {
    minWidth: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    paddingHorizontal: ms(5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.goldLight,
  },
  badgeText: { color: '#3B1D06', fontSize: FS.xs },
});
