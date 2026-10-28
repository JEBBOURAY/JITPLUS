import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Trophy, Clock, ShoppingBag, Gift, type LucideIcon } from 'lucide-react-native';
import { describeWheelEnd } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms } from '@/utils/responsive';
import type { MerchantActiveLuckyWheel } from '@/types';
import FicheSection from './FicheSection';

const MAX_PRIZES = 6;

interface Props {
  wheel: MerchantActiveLuckyWheel;
}

function MerchantLuckyWheel({ wheel }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();

  const facts: { key: string; Icon: LucideIcon; label: string }[] = [
    { key: 'ends', Icon: Clock, label: describeWheelEnd(wheel.endsAt, t, 'merchant') },
    ...(wheel.globalWinRate > 0
      ? [{ key: 'rate', Icon: Trophy, label: t('merchant.luckyWheelWinRate', { rate: Math.round(wheel.globalWinRate * 100) }) }]
      : []),
    ...(wheel.minSpendAmount > 0
      ? [{ key: 'min', Icon: ShoppingBag, label: t('merchant.luckyWheelMinSpend', { amount: wheel.minSpendAmount }) }]
      : []),
  ];
  const prizes = wheel.prizes.slice(0, MAX_PRIZES);

  return (
    <FicheSection title={t('merchant.luckyWheelLabel')}>
      <Text style={[styles.name, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2}>{wheel.name}</Text>
      {!!wheel.description && (
        <Text style={[styles.description, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={3}>
          {wheel.description}
        </Text>
      )}

      <View style={styles.lines}>
        {facts.map(({ key, Icon, label }) => (
          <View key={key} style={styles.line}>
            <Icon size={ms(15)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.lineText, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>

      {prizes.length > 0 && (
        <>
          <Text style={[styles.subheading, { color: theme.text, fontFamily: fonts.semibold }]}>{t('merchant.luckyWheelPrizes')}</Text>
          <View style={styles.lines}>
            {prizes.map((prize) => (
              <View key={prize.id} style={styles.line}>
                <Gift size={ms(15)} color={theme.textMuted} strokeWidth={2} />
                <Text style={[styles.lineText, { color: theme.text, fontFamily: fonts.regular }]} numberOfLines={1}>{prize.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[styles.hint, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('merchant.luckyWheelHint')}</Text>
    </FicheSection>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: ms(15), lineHeight: ms(20) },
  description: { fontSize: ms(14), lineHeight: ms(20), marginTop: hp(4) },
  lines: { gap: hp(8), marginTop: hp(12) },
  line: { flexDirection: 'row', alignItems: 'center', gap: wp(10) },
  lineText: { flex: 1, fontSize: ms(14) },
  subheading: { fontSize: ms(14), marginTop: hp(16) },
  hint: { fontSize: ms(13), lineHeight: ms(18), marginTop: hp(14) },
});

export default memo(MerchantLuckyWheel);
