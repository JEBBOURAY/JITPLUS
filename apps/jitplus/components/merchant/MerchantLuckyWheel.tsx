import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ticket, Trophy, Clock, ShoppingBag, Gift, type LucideIcon } from 'lucide-react-native';
import { brandGradientFull } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms } from '@/utils/responsive';
import type { MerchantActiveLuckyWheel } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;
const MAX_PRIZES = 6;

interface Props {
  wheel: MerchantActiveLuckyWheel;
}

function MerchantLuckyWheel({ wheel }: Props) {
  const { t } = useLanguage();
  const fonts = useAppFonts();

  const daysLeft = Math.max(0, Math.ceil((new Date(wheel.endsAt).getTime() - Date.now()) / DAY_MS));
  const endsLabel = daysLeft === 0
    ? t('merchant.luckyWheelEndsToday')
    : daysLeft === 1
      ? t('merchant.luckyWheelEndsTomorrow')
      : t('merchant.luckyWheelEndsIn', { days: daysLeft });

  const chips: { key: string; Icon: LucideIcon; label: string }[] = [
    ...(wheel.globalWinRate > 0
      ? [{ key: 'rate', Icon: Trophy, label: t('merchant.luckyWheelWinRate', { rate: Math.round(wheel.globalWinRate * 100) }) }]
      : []),
    ...(wheel.minSpendAmount > 0
      ? [{ key: 'min', Icon: ShoppingBag, label: t('merchant.luckyWheelMinSpend', { amount: wheel.minSpendAmount }) }]
      : []),
    { key: 'ends', Icon: Clock, label: endsLabel },
  ];
  const prizes = wheel.prizes.slice(0, MAX_PRIZES);

  return (
    <LinearGradient colors={brandGradientFull} start={DIAG_START} end={DIAG_END} style={styles.card}>
      <View pointerEvents="none" style={styles.watermark}>
        <Ticket size={ms(130)} color="rgba(255,255,255,0.10)" strokeWidth={1.2} />
      </View>

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ticket size={ms(18)} color="#fff" strokeWidth={2} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.overline, { fontFamily: fonts.semibold }]}>{t('merchant.luckyWheelLabel')}</Text>
          <Text style={[styles.name, { fontFamily: fonts.bold }]} numberOfLines={2}>{wheel.name}</Text>
        </View>
      </View>

      {!!wheel.description && (
        <Text style={[styles.description, { fontFamily: fonts.regular }]} numberOfLines={3}>{wheel.description}</Text>
      )}

      <View style={styles.chips}>
        {chips.map(({ key, Icon, label }) => (
          <View key={key} style={styles.chip}>
            <Icon size={ms(13)} color="#fff" strokeWidth={2} />
            <Text style={[styles.chipText, { fontFamily: fonts.semibold }]} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>

      {prizes.length > 0 && (
        <>
          <Text style={[styles.prizesTitle, { fontFamily: fonts.bold }]}>{t('merchant.luckyWheelPrizes')}</Text>
          <View style={styles.prizes}>
            {prizes.map((prize) => (
              <View key={prize.id} style={styles.prize}>
                <Gift size={ms(13)} color="#FDE68A" strokeWidth={2} />
                <Text style={[styles.prizeText, { fontFamily: fonts.medium }]} numberOfLines={1}>{prize.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[styles.hint, { fontFamily: fonts.regular }]}>{t('merchant.luckyWheelHint')}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: ms(22), padding: wp(16), overflow: 'hidden' },
  watermark: { position: 'absolute', top: -ms(20), right: -ms(24), transform: [{ rotate: '-18deg' }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  iconWrap: {
    width: ms(40), height: ms(40), borderRadius: ms(13),
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  overline: { color: 'rgba(255,255,255,0.8)', fontSize: ms(11), textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { color: '#fff', fontSize: ms(17), marginTop: hp(2) },
  description: { color: 'rgba(255,255,255,0.88)', fontSize: ms(13), lineHeight: ms(19), marginTop: hp(10) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(6), marginTop: hp(12) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5),
    paddingHorizontal: wp(10), paddingVertical: hp(5), borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  chipText: { color: '#fff', fontSize: ms(12) },
  prizesTitle: { color: '#fff', fontSize: ms(13), marginTop: hp(16), marginBottom: hp(8) },
  prizes: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(6) },
  prize: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6), maxWidth: '100%',
    paddingHorizontal: wp(10), paddingVertical: hp(6), borderRadius: ms(12),
    backgroundColor: 'rgba(15,23,42,0.22)',
  },
  prizeText: { color: '#fff', fontSize: ms(12), flexShrink: 1 },
  hint: { color: 'rgba(255,255,255,0.78)', fontSize: ms(12), lineHeight: ms(17), marginTop: hp(14) },
});

export default memo(MerchantLuckyWheel);
