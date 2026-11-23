import { memo, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import type { ClientDealSummary } from '@jitplus/shared/src/deals';
import { Text } from '@/components/AppText';
import DealRow from '@/components/deals/DealRow';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { isEntityId } from '@/utils/ids';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import FicheSection from './FicheSection';

interface Props {
  /** Live deals; only fetched for signed-in customers. */
  deals: ClientDealSummary[] | undefined;
  /** From the merchant payload: guests only learn how many deals there are. */
  activeDealCount?: number;
  isAuthenticated: boolean;
  onLocked: () => void;
}


/** Deals of the merchant, or a sign-in teaser for guests. */
function MerchantDeals({ deals, activeDealCount, isAuthenticated, onLocked }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const router = useRouter();

  const openDeal = useCallback((deal: ClientDealSummary) => {
    if (!isEntityId(deal.id)) return;
    haptic();
    router.push({ pathname: '/deal/[id]', params: { id: deal.id } });
  }, [router]);

  if (!isAuthenticated) {
    if (!activeDealCount) return null;
    return (
      <FicheSection title={t('deals.merchant.title')}>
        <Pressable
          onPress={() => { haptic(); onLocked(); }}
          style={({ pressed }) => [styles.locked, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          <View style={[styles.lockIcon, { backgroundColor: theme.bgInput }]}>
            <Lock size={ms(20)} color={theme.textSecondary} strokeWidth={1.75} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.lockedTitle, { color: theme.text, fontFamily: fonts.semibold }]}>
              {t(pluralKey('deals.merchant.lockedTitle', activeDealCount), { count: activeDealCount })}
            </Text>
            <Text style={[styles.lockedBody, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('deals.merchant.lockedBody')}</Text>
          </View>
          <Text style={[styles.unlock, { color: theme.primary, fontFamily: fonts.semibold }]}>{t('deals.merchant.unlock')}</Text>
        </Pressable>
      </FicheSection>
    );
  }

  if (!deals || deals.length === 0) return null;

  return (
    <FicheSection
      title={`${t('deals.merchant.title')} (${deals.length})`}
      variant="plain"
    >
      <View style={styles.list}>
        {deals.map((deal) => <DealRow key={deal.id} deal={deal} onPress={openDeal} hideMerchant />)}
      </View>
    </FicheSection>
  );
}

export default memo(MerchantDeals);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: hp(12) },
  locked: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  lockIcon: { width: ms(44), height: ms(44), borderRadius: ms(22), alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { fontSize: fontSize.md },
  lockedBody: { fontSize: fontSize.sm, lineHeight: ms(18), marginTop: hp(2) },
  unlock: { fontSize: fontSize.sm },
});
