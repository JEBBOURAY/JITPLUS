import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Wallet, BadgeCheck, LogOut } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { merchantStyles as styles } from './merchantStyles';
import { wp } from '@/utils/responsive';
import type { Merchant } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface MerchantBottomBarProps {
  merchant: Merchant;
  justJoined: boolean;
  justLeft: boolean;
  joinLoading: boolean;
  leaveLoading: boolean;
  handleJoinMerchant: () => void;
  handleLeaveMerchant: () => void;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantBottomBar({
  merchant, justJoined, justLeft, joinLoading, leaveLoading,
  handleJoinMerchant, handleLeaveMerchant, theme, t,
}: MerchantBottomBarProps) {
  return (
    <View style={[styles.bottomBar, { backgroundColor: theme.bg, borderTopColor: theme.borderLight }]}>
      <SafeAreaView edges={['bottom']} style={styles.bottomBarInner}>
        {(justLeft || merchant.cardDeactivated) && !justJoined ? (
          <Pressable
            onPress={handleJoinMerchant} disabled={joinLoading}
            style={({ pressed }) => [styles.joinBtn, { backgroundColor: palette.violet, opacity: pressed || joinLoading ? 0.85 : 1 }]}
            accessibilityRole="button" accessibilityLabel={t('merchant.rejoinCard')}
          >
            {joinLoading ? <ActivityIndicator size="small" color="#fff" /> : <Wallet size={18} color="#fff" strokeWidth={2} />}
            <Text style={styles.joinBtnText} numberOfLines={1}>{t('merchant.rejoinCard')}</Text>
          </Pressable>
        ) : (merchant.hasCard || justJoined) ? (
          <View style={styles.memberBar}>
            <View style={[styles.joinedBanner, { backgroundColor: `${palette.emerald}08`, borderColor: `${palette.emerald}25` }]}>
              <BadgeCheck size={18} color={palette.emerald} strokeWidth={2} />
              <Text style={[styles.joinedText, { color: palette.emerald }]}>{t('merchant.alreadyMember')}</Text>
            </View>
            <Pressable
              onPress={handleLeaveMerchant} disabled={leaveLoading}
              style={({ pressed }) => [styles.leaveBtn, { borderColor: '#EF444440', backgroundColor: '#EF444408', opacity: pressed || leaveLoading ? 0.7 : 1 }]}
              accessibilityRole="button" accessibilityLabel={t('merchant.leaveCard')}
            >
              {leaveLoading ? <ActivityIndicator size="small" color="#EF4444" /> : <LogOut size={18} color="#EF4444" strokeWidth={2} />}
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handleJoinMerchant} disabled={joinLoading}
            style={({ pressed }) => [styles.joinBtn, { backgroundColor: palette.violet, opacity: pressed || joinLoading ? 0.85 : 1 }]}
            accessibilityRole="button" accessibilityLabel={t('merchant.getLoyaltyCard')}
          >
            {joinLoading ? <ActivityIndicator size="small" color="#fff" /> : <Wallet size={18} color="#fff" strokeWidth={2} />}
            <Text style={styles.joinBtnText} numberOfLines={1}>{t('merchant.getLoyaltyCard')}</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

export default React.memo(MerchantBottomBar);
