import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Trophy, Clock, ShoppingBag, Gift, type LucideIcon } from 'lucide-react-native';
import { formatMoney } from '@jitplus/shared/src/currency';
import { describeWheelEnd } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import type { MerchantActiveLuckyWheel } from '@/types';
import FicheSection from './FicheSection';

const MAX_PRIZES = 6;

interface Props {
  wheel: MerchantActiveLuckyWheel;
  /** Merchant's ISO currency code (MAD when absent). */
  currency?: string;
}

function MerchantLuckyWheel({ wheel, currency }: Props) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const fonts = useAppFonts();

  const facts: { key: string; Icon: LucideIcon; label: string }[] = [
    { key: 'ends', Icon: Clock, label: describeWheelEnd(wheel.endsAt, t, 'merchant') },
    ...(wheel.globalWinRate > 0
      ? [{ key: 'rate', Icon: Trophy, label: t('merchant.luckyWheelWinRate', { rate: Math.round(wheel.globalWinRate * 100) }) }]
      : []),
    ...(wheel.minSpendAmount > 0
      ? [{ key: 'min', Icon: ShoppingBag, label: t('merchant.luckyWheelMinSpend', { amount: formatMoney(wheel.minSpendAmount, currency, locale) }) }]
      : []),
  ];
  const prizes = wheel.prizes.slice(0, MAX_PRIZES);
  const label = t('merchant.luckyWheelLabel');
  // Merchants often keep the default name: do not print "Roue de la chance" twice.
  const showName = !!wheel.name && wheel.name.trim().toLowerCase() !== label.toLowerCase();

  return (
    <FicheSection title={label}>
      {showName && (
        <Text style={[styles.name, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2}>{wheel.name}</Text>
      )}
      {!!wheel.description && (
        <Text style={[styles.description, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={3}>
          {wheel.description}
        </Text>
      )}

      <View style={[styles.lines, (showName || !!wheel.description) && styles.linesSpaced]}>
        {facts.map(({ key, Icon, label }) => (
          <View key={key} style={styles.line}>
            <Icon size={ms(16)} color={theme.textMuted} strokeWidth={1.75} />
            <Text style={[styles.lineText, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>

      {prizes.length > 0 && (
        <>
          <Text style={[styles.subheading, { color: theme.text, fontFamily: fonts.semibold }]}>{t('merchant.luckyWheelPrizes')}</Text>
          <View style={[styles.lines, styles.linesSpaced]}>
            {prizes.map((prize) => (
              <View key={prize.id} style={styles.line}>
                <Gift size={ms(16)} color={theme.textMuted} strokeWidth={1.75} />
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
  name: { fontSize: fontSize.md, lineHeight: ms(20) },
  description: { fontSize: fontSize.md, lineHeight: ms(22), marginTop: hp(4) },
  lines: { gap: hp(8) },
  linesSpaced: { marginTop: hp(12) },
  line: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  lineText: { flex: 1, fontSize: fontSize.md },
  subheading: { fontSize: fontSize.md, marginTop: hp(16) },
  hint: { fontSize: fontSize.sm, lineHeight: ms(18), marginTop: hp(16) },
});

export default memo(MerchantLuckyWheel);
