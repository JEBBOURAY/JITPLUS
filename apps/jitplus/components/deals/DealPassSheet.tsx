import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { intlLocaleTag } from '@jitplus/shared/src/currency';
import type { ClientDealDetail } from '@jitplus/shared/src/deals';
import { Text } from '@/components/AppText';
import BottomSheet from '@/components/BottomSheet';
import MerchantLogo from '@/components/MerchantLogo';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp, fontSize, radius } from '@/utils/responsive';

interface Props {
  visible: boolean;
  deal: ClientDealDetail;
  /** "-30 %", "1+1 OFFERT"… */
  badge: string | null;
  /** What the client pays, when the deal gives a price */
  price: string | null;
  onClose: () => void;
}

/**
 * The time of day, ticking: the cashier sees a live screen, not a screenshot.
 * Mounted only while the pass is open, so it starts at the current time and
 * nothing ticks behind a closed sheet.
 */
function PassClock() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { locale } = useLanguage();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text style={[styles.clock, { color: theme.text, fontFamily: fonts.bold }]} accessibilityElementsHidden>
      {now.toLocaleTimeString(intlLocaleTag(locale), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </Text>
  );
}

/** "J'en profite": what the client shows at the till to get the deal. */
export default React.memo(function DealPassSheet({ visible, deal, badge, price, onClose }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const firstName = useAuthStore((s) => s.client?.prenom ?? null);
  const activated = deal.claimedAt
    ? new Date(deal.claimedAt).toLocaleDateString(intlLocaleTag(locale), { day: 'numeric', month: 'long' })
    : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backdropLabel={t('common.close')}
      style={[styles.sheet, { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom, hp(16)) + hp(8) }]}
    >
      <Text style={[styles.label, { color: theme.textSecondary, fontFamily: fonts.semibold }]}>{t('deals.pass.title')}</Text>

      <View style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
        <View style={styles.merchant}>
          <MerchantLogo logoUrl={deal.merchant.logoUrl} merchantName={deal.merchant.nom} style={styles.logo} />
          <Text style={[styles.merchantName, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
            {deal.merchant.nom}
          </Text>
        </View>
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={3} accessibilityRole="header">
          {deal.title}
        </Text>
        {(!!badge || !!price) && (
          <View style={styles.offer}>
            {!!badge && (
              <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                <Text style={[styles.badgeText, { fontFamily: fonts.bold }]}>{badge}</Text>
              </View>
            )}
            {!!price && <Text style={[styles.price, { color: theme.text, fontFamily: fonts.semibold }]}>{price}</Text>}
          </View>
        )}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        {visible && <PassClock />}
        <Text style={[styles.meta, { color: theme.textMuted, fontFamily: fonts.regular }]}>
          {[firstName ? t('deals.pass.holder', { name: firstName }) : null, activated ? t('deals.pass.activated', { date: activated }) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <Text style={[styles.hint, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('deals.pass.hint')}</Text>

      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.close, { backgroundColor: palette.violet, opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
      >
        <Text style={[styles.closeText, { fontFamily: fonts.semibold }]}>{t('deals.pass.close')}</Text>
      </Pressable>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: wp(20), gap: hp(14) },
  label: { fontSize: fontSize.sm, textAlign: 'center' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: ms(16), gap: hp(10), alignItems: 'center' },
  merchant: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  logo: { width: ms(28), height: ms(28), borderRadius: ms(8) },
  merchantName: { flexShrink: 1, fontSize: fontSize.sm },
  title: { fontSize: fontSize.xl, lineHeight: ms(26), textAlign: 'center' },
  offer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: wp(8) },
  badge: { borderRadius: radius.sm, paddingHorizontal: wp(8), paddingVertical: hp(3) },
  badgeText: { color: '#FFFFFF', fontSize: fontSize.sm },
  price: { fontSize: fontSize.md },
  divider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, marginVertical: hp(2) },
  clock: { fontSize: ms(28), fontVariant: ['tabular-nums'] },
  meta: { fontSize: fontSize.sm, textAlign: 'center' },
  hint: { fontSize: fontSize.sm, lineHeight: ms(19), textAlign: 'center' },
  close: { height: ms(52), borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFFFFF', fontSize: fontSize.md },
});
