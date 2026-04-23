import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ticket, Trophy, Clock, ShoppingBag, Gift } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { merchantStyles as styles } from './merchantStyles';
import { hp, wp, ms } from '@/utils/responsive';
import { StyleSheet } from 'react-native';
import type { Merchant } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface Props {
  merchant: Merchant;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantLuckyWheel({ merchant, theme, t }: Props) {
  const luckyWheel = merchant.activeLuckyWheel;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!luckyWheel) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [luckyWheel, pulse]);

  // Memoize interpolations — stable refs, recalculated only when pulse changes
  const borderColor = useMemo(() => pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [palette.violet, palette.gold, palette.violet],
  }), [pulse]);
  const glowBg = useMemo(() => pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [`${palette.violet}12`, `${palette.gold}18`, `${palette.violet}12`],
  }), [pulse]);
  const badgeBg = useMemo(() => pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [`${palette.violet}20`, `${palette.gold}25`, `${palette.violet}20`],
  }), [pulse]);

  if (!luckyWheel) return null;

  const endsAt = new Date(luckyWheel.endsAt);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const endsLabel = daysLeft === 0
    ? t('merchant.luckyWheelEndsToday')
    : daysLeft === 1
      ? t('merchant.luckyWheelEndsTomorrow')
      : t('merchant.luckyWheelEndsIn', { days: daysLeft });

  return (
    <Animated.View style={[styles.loyaltyRewardCard, { backgroundColor: theme.bgCard, borderWidth: 1.5, borderColor }]}>
      <LinearGradient
        colors={[theme.bgCard, `${palette.violet}08`, `${palette.gold}10`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={local.gradientInner}
      >
        {/* Header */}
        <View style={local.header}>
          <Animated.View style={[styles.cardIconBadge, { backgroundColor: badgeBg }]}>
            <Ticket size={ms(16)} color={palette.gold} strokeWidth={1.5} />
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardLabel, { color: palette.violet, fontWeight: '800' }]}>{t('merchant.luckyWheelLabel')}</Text>
            <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1}>{luckyWheel.name}</Text>
          </View>
        </View>

        {/* Description */}
        {!!luckyWheel.description && (
          <Text style={[local.description, { color: theme.textSecondary }]} numberOfLines={3}>
            {luckyWheel.description}
          </Text>
        )}

        {/* Info chips */}
        <View style={local.chipsRow}>
          <Animated.View style={[local.chip, { backgroundColor: glowBg }]}>
            <Trophy size={ms(13)} color={palette.gold} strokeWidth={1.5} />
            <Text style={[local.chipText, { color: palette.gold }]} numberOfLines={1}>
              {t('merchant.luckyWheelWinRate', { rate: Math.round((luckyWheel.globalWinRate ?? 0) * 100) })}
            </Text>
          </Animated.View>
          {luckyWheel.minSpendAmount > 0 && (
            <Animated.View style={[local.chip, { backgroundColor: glowBg }]}>
              <ShoppingBag size={ms(13)} color={palette.gold} strokeWidth={1.5} />
              <Text style={[local.chipText, { color: palette.gold }]} numberOfLines={1}>
                {t('merchant.luckyWheelMinSpend', { amount: luckyWheel.minSpendAmount })}
              </Text>
            </Animated.View>
          )}
          <Animated.View style={[local.chip, { backgroundColor: glowBg }]}>
            <Clock size={ms(13)} color={palette.gold} strokeWidth={1.5} />
            <Text style={[local.chipText, { color: palette.gold }]} numberOfLines={1}>
              {endsLabel}
            </Text>
          </Animated.View>
        </View>

        {/* Prizes */}
        {luckyWheel.prizes.length > 0 && (
          <>
            <View style={[styles.loyaltyDivider, { backgroundColor: theme.borderLight }]} />
            <View style={local.prizesHeader}>
              <Animated.View style={[styles.cardIconBadge, { backgroundColor: badgeBg }]}>
                <Trophy size={ms(16)} color={palette.gold} strokeWidth={1.5} />
              </Animated.View>
              <Text style={[styles.cardLabel, { color: palette.violet, marginBottom: 0, fontWeight: '700' }]}>
                {t('merchant.luckyWheelPrizes')}
              </Text>
            </View>
            <View style={local.prizesList}>
              {luckyWheel.prizes.map((prize) => (
                <View key={prize.id} style={[local.prizeItem, { backgroundColor: `${palette.violet}08`, borderColor: `${palette.gold}30` }]}>
                  <Gift size={ms(14)} color={palette.gold} strokeWidth={1.5} />
                  <Text style={[local.prizeLabel, { color: theme.text }]} numberOfLines={1}>{prize.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

const local = StyleSheet.create({
  gradientInner: { borderRadius: ms(16), padding: wp(16) },
  header: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  description: { fontSize: ms(13), lineHeight: ms(19), marginTop: hp(8) },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(6), marginTop: hp(10) },
  chip: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(4),
    paddingHorizontal: wp(6), paddingVertical: hp(5), borderRadius: ms(10),
    overflow: 'hidden',
  },
  chipText: { fontSize: ms(11), fontWeight: '700', flexShrink: 1 },
  prizesHeader: { flexDirection: 'row', alignItems: 'center', gap: wp(12), marginBottom: hp(8) },
  prizesList: { gap: hp(6) },
  prizeItem: {
    flexDirection: 'row', alignItems: 'center', gap: wp(8),
    paddingHorizontal: wp(12), paddingVertical: hp(8), borderRadius: ms(12), borderWidth: 1,
  },
  prizeLabel: { fontSize: ms(13), fontWeight: '600', flex: 1 },
});

export default React.memo(MerchantLuckyWheel);
