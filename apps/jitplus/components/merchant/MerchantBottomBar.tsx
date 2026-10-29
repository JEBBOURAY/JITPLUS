import { memo } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, LogOut, Wallet } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

interface Props {
  merchant: Merchant;
  joinLoading: boolean;
  leaveLoading: boolean;
  onJoin: () => void;
  onLeave: () => void;
}

/** Primary action of the page: get the card, reactivate it, or, once a member, leave it. */
function MerchantBottomBar({ merchant, joinLoading, leaveLoading, onJoin, onLeave }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const joinLabel = merchant.cardDeactivated ? t('merchant.rejoinCard') : t('merchant.getLoyaltyCard');

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, hp(10)) },
      ]}
    >
      {merchant.hasCard ? (
        <View style={styles.memberRow}>
          <View
            style={[styles.memberBadge, { backgroundColor: `${theme.success}12`, borderColor: `${theme.success}40` }]}
            accessibilityRole="text"
          >
            <BadgeCheck size={ms(18)} color={theme.success} strokeWidth={2} />
            <Text style={[styles.memberText, { color: theme.success, fontFamily: fonts.semibold }]} numberOfLines={1}>
              {t('merchant.alreadyMember')}
            </Text>
          </View>
          <Pressable
            onPress={onLeave}
            disabled={leaveLoading}
            hitSlop={6}
            style={({ pressed }) => [
              styles.leaveBtn,
              { borderColor: `${theme.danger}40`, opacity: pressed || leaveLoading ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ busy: leaveLoading }}
            accessibilityLabel={t('merchant.leaveCard')}
          >
            {leaveLoading
              ? <ActivityIndicator size="small" color={theme.danger} />
              : <LogOut size={ms(18)} color={theme.danger} strokeWidth={2} />}
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onJoin}
          disabled={joinLoading}
          style={({ pressed }) => [styles.cta, { opacity: pressed || joinLoading ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityState={{ busy: joinLoading }}
          accessibilityLabel={joinLabel}
        >
          {joinLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Wallet size={ms(18)} color="#fff" strokeWidth={2} />}
          <Text style={[styles.ctaText, { fontFamily: fonts.semibold }]} numberOfLines={1}>{joinLabel}</Text>
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
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10) },
  memberBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    height: ms(48), paddingHorizontal: wp(16), borderRadius: ms(12), borderWidth: 1,
  },
  memberText: { fontSize: ms(15), flexShrink: 1 },
  leaveBtn: {
    width: ms(48), height: ms(48), borderRadius: ms(12), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});

export default memo(MerchantBottomBar);
