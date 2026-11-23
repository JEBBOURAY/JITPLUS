import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { pluralKey } from '@jitplus/shared';
import { Text } from '@/components/AppText';
import { Gift, Lock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import type { MerchantLoyalty } from './useMerchantLoyalty';

/** Welcome gift: the offer before the card is added, then the stamps waiting for the first scan. */
function MerchantWelcomeBanner({ loyalty, accent }: { loyalty: MerchantLoyalty; accent: string }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const { lockedWelcome, welcomeOffer, isMember } = loyalty;
  if (!lockedWelcome && !welcomeOffer) return null;

  const Icon = lockedWelcome ? Lock : Gift;
  const title = lockedWelcome
    ? t(pluralKey('merchant.welcomeLockedTitle', lockedWelcome.stamps), { count: lockedWelcome.stamps })
    : t(pluralKey('merchant.welcomeOfferTitle', welcomeOffer!.stamps), { count: welcomeOffer!.stamps });
  const body = lockedWelcome
    ? t('merchant.welcomeLockedBody')
    : !isMember && welcomeOffer!.trigger === 'CARD_OR_SCAN'
      ? t('merchant.welcomeOfferCard')
      : t('merchant.welcomeOfferScan');

  return (
    <View style={[styles.box, { backgroundColor: `${accent}12` }]}>
      <Icon size={ms(20)} color={accent} strokeWidth={1.75} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.semibold }]}>{title}</Text>
        <Text style={[styles.body, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: wp(12), padding: ms(12), borderRadius: radius.md, marginBottom: hp(16) },
  text: { flex: 1 },
  title: { fontSize: fontSize.md, lineHeight: ms(20) },
  body: { fontSize: fontSize.sm, lineHeight: ms(18), marginTop: hp(2) },
});

export default memo(MerchantWelcomeBanner);
