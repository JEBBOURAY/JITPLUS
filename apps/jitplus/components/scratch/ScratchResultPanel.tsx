import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { CalendarClock, Check, QrCode, RefreshCw, Store } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { formatDate } from '@/utils/date';
import { hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { describeCouponConditions } from '@jitplus/shared/src/scratch';
import type { CouponDto } from '@jitplus/shared/src/scratch';
import { scratchSharedStyles as shared } from './scratchStyles';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  coupon: CouponDto | null;
  reward: { headline: string; detail: string | null } | null;
  drawError: boolean;
  reduceMotion: boolean;
  scratchable: boolean;
  merchantName: string;
  locale: string;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onRetry: () => void;
  onDone: () => void;
  onOpenMyCard: () => void;
}

/** Panel under the card once revealed: pending draw, draw error, or the won reward and how to use it. */
export default React.memo(function ScratchResultPanel({
  coupon, reward, drawError, reduceMotion, scratchable, merchantName, locale, fonts, t, onRetry, onDone, onOpenMyCard,
}: Props) {
  const conditionLines = useMemo(() => {
    if (!coupon) return [];
    return describeCouponConditions(coupon, t, (iso) => formatDate(iso, locale));
  }, [coupon, t, locale]);

  if (!coupon) {
    return (
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(250)} style={styles.panel}>
        {drawError ? (
          <>
            <Text style={[styles.panelText, { fontFamily: fonts.medium }]}>{t('scratch.screen.drawError')}</Text>
            <TouchableOpacity onPress={onRetry} activeOpacity={0.8} style={shared.ghostBtn} accessibilityRole="button">
              <RefreshCw size={ms(16)} color="#fff" strokeWidth={2} />
              <Text style={[shared.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.revealingRow}>
            <ActivityIndicator color={palette.goldLight} />
            <Text style={[styles.panelText, { fontFamily: fonts.medium }]}>{t('scratch.screen.revealing')}</Text>
          </View>
        )}
      </Animated.View>
    );
  }

  const active = coupon.status === 'ACTIVE';
  // describeCouponConditions ends with [..., expiry, single use].
  const expiryLine = coupon.expiresAt ? conditionLines.length - 2 : -1;
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(scratchable ? 250 : 0).springify().damping(16)}
      style={styles.panel}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.kicker, { fontFamily: fonts.semibold }]}>{t('scratch.card.youWon')}</Text>
      <Text style={[styles.rewardTitle, { fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={3}>
        {reward?.headline ?? null}
      </Text>
      {!!reward?.detail && (
        <Text style={[styles.rewardDetail, { fontFamily: fonts.regular }]} numberOfLines={2}>{reward.detail}</Text>
      )}

      {active ? (
        <>
          <View style={styles.steps}>
            <Text style={[styles.stepsTitle, { fontFamily: fonts.semibold }]}>{t('scratch.screen.howToUse')}</Text>
            <View style={styles.stepRow}>
              <View style={styles.stepIcon}><Store size={ms(16)} color={palette.goldLight} strokeWidth={2} /></View>
              <Text style={[styles.stepText, { fontFamily: fonts.medium }]}>
                {t('scratch.screen.stepVisit', { merchant: merchantName })}
              </Text>
            </View>
            <View style={styles.stepRow}>
              <View style={styles.stepIcon}><QrCode size={ms(16)} color={palette.goldLight} strokeWidth={2} /></View>
              <Text style={[styles.stepText, { fontFamily: fonts.medium }]}>{t('scratch.screen.stepShowCard')}</Text>
            </View>
            <Text style={[styles.stepsNote, { fontFamily: fonts.regular }]}>{t('scratch.screen.noCouponNeeded')}</Text>
          </View>

          {conditionLines.length > 0 && (
            <View style={styles.conditions}>
              <Text style={[styles.conditionsTitle, { fontFamily: fonts.semibold }]}>{t('scratch.screen.conditions')}</Text>
              {conditionLines.map((line, i) => (
                <View key={i} style={styles.conditionRow}>
                  {i === expiryLine
                    ? <CalendarClock size={ms(14)} color={palette.goldLight} strokeWidth={2} />
                    : <Check size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={2.4} />}
                  <Text style={[styles.conditionText, { fontFamily: fonts.regular }]}>{line}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={styles.statusPill}>
          <Text style={[styles.statusText, { fontFamily: fonts.semibold }]}>
            {coupon.status === 'REDEEMED' && coupon.redeemedAt
              ? t('scratch.coupons.usedOn', { date: formatDate(coupon.redeemedAt, locale) })
              : t(`scratch.couponStatus.${coupon.status}`)}
          </Text>
        </View>
      )}

      <TouchableOpacity onPress={onDone} activeOpacity={0.85} style={styles.primaryWrap} accessibilityRole="button">
        <LinearGradient
          colors={[palette.goldSoft, palette.goldLight, palette.goldDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.primary}
        >
          <Text style={[styles.primaryText, { fontFamily: fonts.bold }]}>{t('scratch.screen.done')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      {active && (
        <TouchableOpacity onPress={onOpenMyCard} activeOpacity={0.7} style={styles.secondary} accessibilityRole="button">
          <Text style={[styles.secondaryText, { fontFamily: fonts.semibold }]}>{t('scratch.screen.openMyCard')}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: hp(20),
    padding: ms(18),
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    gap: hp(4),
  },
  revealingRow: { flexDirection: 'row', alignItems: 'center', gap: ms(10), paddingVertical: hp(6) },
  panelText: { color: 'rgba(255,255,255,0.8)', fontSize: FS.sm, textAlign: 'center' },
  kicker: { color: palette.goldLight, fontSize: FS.xs, textTransform: 'uppercase', letterSpacing: 1.2 },
  rewardTitle: { color: '#fff', fontSize: FS['2xl'], textAlign: 'center', letterSpacing: -0.4, marginTop: hp(2) },
  rewardDetail: { color: 'rgba(255,255,255,0.7)', fontSize: FS.sm, textAlign: 'center' },

  steps: {
    alignSelf: 'stretch',
    marginTop: hp(14),
    padding: ms(14),
    borderRadius: radius.lg,
    backgroundColor: 'rgba(124,58,237,0.18)',
    gap: hp(10),
  },
  stepsTitle: { color: '#fff', fontSize: FS.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: ms(10) },
  stepIcon: {
    width: ms(30),
    height: ms(30),
    borderRadius: ms(15),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.14)',
  },
  stepText: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: FS.sm, lineHeight: ms(19) },
  stepsNote: { color: 'rgba(255,255,255,0.55)', fontSize: FS.xs, lineHeight: ms(17) },

  conditions: { alignSelf: 'stretch', marginTop: hp(12), gap: hp(6) },
  conditionsTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: FS.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: hp(2),
  },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: ms(8) },
  conditionText: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: FS.sm },

  statusPill: {
    marginTop: hp(12),
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statusText: { color: 'rgba(255,255,255,0.85)', fontSize: FS.sm },

  primaryWrap: {
    alignSelf: 'stretch',
    marginTop: hp(18),
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: palette.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  primary: { height: ms(52), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  primaryText: { color: '#3B1D06', fontSize: FS.md },
  secondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: hp(12) },
  secondaryText: { color: 'rgba(255,255,255,0.75)', fontSize: FS.sm },
});
