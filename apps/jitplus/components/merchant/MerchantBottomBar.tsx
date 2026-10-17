import React, { memo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wallet, QrCode, Stamp } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

interface Props {
  merchant: Merchant;
  joinLoading: boolean;
  onJoin: () => void;
  onShowQr: () => void;
}

/** Primary action of the page: get the card, reactivate it, or show the QR code at checkout. */
function MerchantBottomBar({ merchant, joinLoading, onJoin, onShowQr }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const accent = getMerchantAccent(merchant.themeColor);
  const isMember = !!merchant.hasCard;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.bgCard, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, hp(12)) },
      ]}
    >
      {isMember ? (
        <View style={styles.memberRow}>
          <View style={[styles.balance, { backgroundColor: `${accent}12` }]}>
            <Stamp size={ms(16)} color={accent} strokeWidth={2} />
            <Text style={[styles.balanceText, { color: accent, fontFamily: fonts.bold }]} numberOfLines={1}>
              {t('merchant.yourStamps', { count: merchant.cardBalance ?? 0 })}
            </Text>
          </View>
          <Pressable
            onPress={onShowQr}
            style={({ pressed }) => [styles.cta, styles.flex, { opacity: pressed ? 0.88 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('merchant.showMyQr')}
          >
            <QrCode size={ms(18)} color="#fff" strokeWidth={2} />
            <Text style={[styles.ctaText, { fontFamily: fonts.bold }]} numberOfLines={1}>{t('merchant.showMyQr')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onJoin}
          disabled={joinLoading}
          style={({ pressed }) => [styles.cta, { opacity: pressed || joinLoading ? 0.88 : 1 }]}
          accessibilityRole="button"
          accessibilityState={{ busy: joinLoading }}
          accessibilityLabel={merchant.cardDeactivated ? t('merchant.rejoinCard') : t('merchant.getLoyaltyCard')}
        >
          {joinLoading ? <ActivityIndicator size="small" color="#fff" /> : <Wallet size={ms(18)} color="#fff" strokeWidth={2} />}
          <View>
            <Text style={[styles.ctaText, { fontFamily: fonts.bold }]} numberOfLines={1}>
              {merchant.cardDeactivated ? t('merchant.rejoinCard') : t('merchant.getLoyaltyCard')}
            </Text>
            {!merchant.cardDeactivated && (
              <Text style={[styles.ctaCaption, { fontFamily: fonts.medium }]} numberOfLines={1}>{t('merchant.joinFree')}</Text>
            )}
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: wp(16), paddingTop: hp(12), borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10) },
  balance: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6), maxWidth: '42%',
    height: ms(52), paddingHorizontal: wp(14), borderRadius: ms(16),
  },
  balanceText: { fontSize: ms(14), flexShrink: 1 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(10),
    minHeight: ms(52), paddingHorizontal: wp(16), borderRadius: ms(16), backgroundColor: palette.violet,
    ...Platform.select({
      ios: { shadowColor: palette.violet, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  ctaText: { color: '#fff', fontSize: ms(15), textAlign: 'center' },
  ctaCaption: { color: 'rgba(255,255,255,0.78)', fontSize: ms(11), textAlign: 'center', marginTop: 1 },
});

export default memo(MerchantBottomBar);
