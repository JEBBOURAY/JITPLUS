import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stamp, Coins, Gift } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { merchantStyles as styles } from './merchantStyles';
import { hp, wp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface MerchantLoyaltyRewardsProps {
  merchant: Merchant;
  justJoined: boolean;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantLoyaltyRewards({ merchant, justJoined, theme, t }: MerchantLoyaltyRewardsProps) {
  const rewardsList = merchant.rewards?.length
    ? merchant.rewards
    : merchant.loyaltyType === 'STAMPS'
      ? [{ id: 'default-stamp', titre: t('common.gift'), cout: merchant.stampsForReward || 10 }]
      : [];

  const hasRewardsSection = rewardsList.length > 0;

  return (
    <LinearGradient
      colors={[theme.bgCard, `${palette.gold}10`, `${palette.gold}18`]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.loyaltyRewardCard, { backgroundColor: theme.bgCard }]}
    >
      <View style={styles.loyaltyRow}>
        <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}15` }]}>
          {merchant.loyaltyType === 'STAMPS'
            ? <Stamp size={ms(16)} color={palette.violet} strokeWidth={1.5} />
            : <Coins size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{t('merchant.loyaltyProgram')}</Text>
          <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1}>
            {merchant.loyaltyType === 'STAMPS' ? t('merchant.stampCard') : t('merchant.pointsAccumulation')}
          </Text>
        </View>
        {(merchant.hasCard || justJoined) && merchant.cardBalance != null && (
          <View style={[styles.balanceBadge, { backgroundColor: `${palette.violet}15` }]}>
            <Text style={[styles.balanceBadgeText, { color: palette.violet }]}>
              {merchant.loyaltyType === 'STAMPS'
                ? t('merchant.yourStamps', { count: merchant.cardBalance })
                : t('merchant.yourPoints', { count: merchant.cardBalance })}
            </Text>
          </View>
        )}
      </View>

      {hasRewardsSection && (
        <>
          <View style={[styles.loyaltyDivider, { backgroundColor: theme.borderLight }]} />
          <View style={styles.rewardsSectionHeader}>
            <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}15` }]}>
              <Gift size={ms(16)} color={palette.violet} strokeWidth={1.5} />
            </View>
            <Text style={[styles.cardLabel, { color: theme.textMuted, marginBottom: 0 }]}>{t('merchant.rewardsSection')}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rewardsScroll}
            contentContainerStyle={styles.rewardsScrollContent}
            removeClippedSubviews={true}
          >
            {rewardsList.map((reward) => (
              <View key={reward.id} style={[styles.rewardCard, { backgroundColor: `${palette.violet}08`, borderColor: `${palette.violet}20` }]}>
                <Gift size={ms(22)} color={palette.violet} strokeWidth={1.5} />
                <Text style={[styles.rewardCardTitle, { color: theme.text }]} numberOfLines={2}>{reward.titre}</Text>
                <View style={[styles.rewardCostBadge, { backgroundColor: `${palette.violet}15` }]}>
                  <Text style={[styles.rewardCost, { color: palette.violet }]} numberOfLines={1}>
                    {merchant.loyaltyType === 'STAMPS'
                      ? t('merchant.stampsCost', { count: reward.cout })
                      : t('merchant.pointsCost', { count: reward.cout })}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </LinearGradient>
  );
}

export default React.memo(MerchantLoyaltyRewards);
