import { memo } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QrCode, Gift } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

interface Props {
  merchant: Merchant;
  joinLoading: boolean;
  /** A member can claim a reward: the QR button turns into a green "claim" call. */
  rewardReady: boolean;
  onJoin: () => void;
  onShowQr: () => void;
}

/** Primary action of the page: get the card, reactivate it, or show the QR code at checkout. */
function MerchantBottomBar({ merchant, joinLoading, rewardReady, onJoin, onShowQr }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const isMember = !!merchant.hasCard;
  const memberLabel = rewardReady ? t('merchant.claimReward') : t('merchant.showMyQr');
  const MemberIcon = rewardReady ? Gift : QrCode;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, hp(10)) },
      ]}
    >
      {isMember ? (
        <Pressable
          onPress={onShowQr}
          style={({ pressed }) => [
            styles.cta, rewardReady && { backgroundColor: theme.success },
            { opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={memberLabel}
        >
          <MemberIcon size={ms(18)} color="#fff" strokeWidth={2} />
          <Text style={[styles.ctaText, { fontFamily: fonts.semibold }]} numberOfLines={1}>{memberLabel}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onJoin}
          disabled={joinLoading}
          style={({ pressed }) => [styles.cta, { opacity: pressed || joinLoading ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityState={{ busy: joinLoading }}
          accessibilityLabel={merchant.cardDeactivated ? t('merchant.rejoinCard') : t('merchant.getLoyaltyCard')}
        >
          {joinLoading && <ActivityIndicator size="small" color="#fff" />}
          <Text style={[styles.ctaText, { fontFamily: fonts.semibold }]} numberOfLines={1}>
            {merchant.cardDeactivated ? t('merchant.rejoinCard') : t('merchant.getLoyaltyCard')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: wp(16), paddingTop: hp(10), borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    height: ms(48), paddingHorizontal: wp(16), borderRadius: ms(12), backgroundColor: palette.violet,
  },
  ctaText: { color: '#fff', fontSize: ms(15), flexShrink: 1, textAlign: 'center' },
});

export default memo(MerchantBottomBar);
