import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stamp, Coins, Gift } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { merchantStyles as styles } from './merchantStyles';
import { hp, wp, ms } from '@/utils/responsive';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { resolveImageUrl } from '@/utils/imageUrl';
import type { Merchant } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface MerchantLoyaltyRewardsProps {
  merchant: Merchant;
  justJoined: boolean;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantLoyaltyRewards({ merchant, justJoined, theme, t }: MerchantLoyaltyRewardsProps) {
  const accent = getMerchantAccent(merchant.themeColor);
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
        <View style={[styles.cardIconBadge, { backgroundColor: `${accent}15` }]}>
          {merchant.loyaltyType === 'STAMPS'
            ? <Stamp size={ms(16)} color={accent} strokeWidth={1.5} />
            : <Coins size={ms(16)} color={accent} strokeWidth={1.5} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{t('merchant.loyaltyProgram')}</Text>
          <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1}>
            {merchant.loyaltyType === 'STAMPS' ? t('merchant.stampCard') : t('merchant.pointsAccumulation')}
          </Text>
        </View>
        {(merchant.hasCard || justJoined) && merchant.cardBalance != null && (
          <View style={[styles.balanceBadge, { backgroundColor: `${accent}15` }]}>
            <Text style={[styles.balanceBadgeText, { color: accent }]}>
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
            <View style={[styles.cardIconBadge, { backgroundColor: `${accent}15` }]}>
              <Gift size={ms(16)} color={accent} strokeWidth={1.5} />
            </View>
            <Text style={[styles.cardLabel, { color: theme.textMuted, marginBottom: 0 }]}>{t('merchant.rewardsSection')}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rewardsScroll}
            contentContainerStyle={styles.rewardsScrollContent}
          >
            {rewardsList.map((reward) => (
              <View key={reward.id} style={[styles.rewardCard, { backgroundColor: `${accent}08`, borderColor: `${accent}20` }]}>
                {reward.imageUrl ? (
                  <ExpoImage
                    source={resolveImageUrl(reward.imageUrl)}
                    style={{ width: ms(48), height: ms(48), borderRadius: ms(10) }}
                    contentFit="cover"
                    cachePolicy="disk"
                    recyclingKey={reward.imageUrl}
                  />
                ) : (
                  <Gift size={ms(22)} color={accent} strokeWidth={1.5} />
                )}
                <Text style={[styles.rewardCardTitle, { color: theme.text }]} numberOfLines={2}>{reward.titre}</Text>
                <View style={[styles.rewardCostBadge, { backgroundColor: `${accent}15` }]}>
                  <Text style={[styles.rewardCost, { color: accent }]} numberOfLines={1}>
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
