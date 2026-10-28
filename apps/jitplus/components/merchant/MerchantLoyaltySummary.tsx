import { memo } from 'react';
import { View, Pressable, StyleSheet, I18nManager } from 'react-native';
import { Text } from '@/components/AppText';
import { Ticket, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { describeWheelEnd, pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms } from '@/utils/responsive';
import type { MerchantActiveLuckyWheel } from '@/types';
import FicheSection from './FicheSection';
import MerchantStampProgress from './MerchantStampProgress';
import RewardThumb from './RewardThumb';
import type { MerchantLoyalty } from './useMerchantLoyalty';

interface Props {
  loyalty: MerchantLoyalty;
  wheel?: MerchantActiveLuckyWheel | null;
  accent: string;
  /** Opens the loyalty tab. */
  onOpen: () => void;
}

/** Overview block: the member's progress, or the first reward a visitor can earn. */
function MerchantLoyaltySummary({ loyalty, wheel, accent, onOpen }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const first = loyalty.rewards[0];
  const Chevron = I18nManager.isRTL ? ChevronLeft : ChevronRight;

  return (
    <FicheSection title={t('merchant.loyaltyProgram')} action={{ label: t('merchant.seeAll'), onPress: onOpen }}>
      {loyalty.isMember ? (
        <MerchantStampProgress loyalty={loyalty} accent={accent} />
      ) : (
        <View style={styles.first}>
          <RewardThumb imageUrl={first.imageUrl} />
          <View style={styles.flex}>
            <Text style={[styles.firstTitle, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2}>{first.titre}</Text>
            <Text style={[styles.firstMeta, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
              {`${t(pluralKey('merchant.stampsCost', first.cout), { count: first.cout })} · ${loyalty.earnLine}`}
            </Text>
          </View>
        </View>
      )}

      {wheel && (
        <Pressable
          onPress={() => { haptic(); onOpen(); }}
          style={({ pressed }) => [styles.wheel, { borderTopColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          <Ticket size={ms(18)} color={theme.textSecondary} strokeWidth={2} />
          <Text style={[styles.wheelText, { color: theme.text, fontFamily: fonts.medium }]} numberOfLines={1}>
            {`${t('merchant.luckyWheelLabel')} · ${describeWheelEnd(wheel.endsAt, t, 'merchant')}`}
          </Text>
          <Chevron size={ms(16)} color={theme.textMuted} strokeWidth={2} />
        </Pressable>
      )}
    </FicheSection>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  first: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  firstTitle: { fontSize: ms(15), lineHeight: ms(20) },
  firstMeta: { fontSize: ms(13), lineHeight: ms(18), marginTop: hp(2) },
  wheel: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    marginTop: hp(14), paddingTop: hp(14), borderTopWidth: StyleSheet.hairlineWidth,
  },
  wheelText: { flex: 1, fontSize: ms(14) },
});

export default memo(MerchantLoyaltySummary);
