import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stamp, Gift, Clock } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { merchantStyles as styles } from './merchantStyles';
import { hp, wp, ms } from '@/utils/responsive';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { resolveImageUrl } from '@/utils/imageUrl';
import { formatDate } from '@/utils/date';
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
    : [{ id: 'default-stamp', titre: t('common.gift'), cout: merchant.stampsForReward || 10 }];
  const hasActiveCard = merchant.hasCard || justJoined;
  const validityText = merchant.stampValidityDays
    ? hasActiveCard && merchant.cardStampsExpireAt
      ? t('merchant.stampsExpireOn', { date: formatDate(merchant.cardStampsExpireAt) })
      : t('merchant.stampsValidity', { days: merchant.stampValidityDays })
    : null;

  return (
    <LinearGradient
      colors={[theme.bgCard, `${palette.gold}10`, `${palette.gold}18`]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.loyaltyRewardCard, { backgroundColor: theme.bgCard }]}
    >
      <View style={styles.loyaltyRow}>
        <View style={[styles.cardIconBadge, { backgroundColor: `${accent}15` }]}>
          <Stamp size={ms(16)} color={accent} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{t('merchant.loyaltyProgram')}</Text>
          <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1}>
            {t('merchant.stampCard')}
          </Text>
        </View>
        {hasActiveCard && merchant.cardBalance != null && (
          <View style={[styles.balanceBadge, { backgroundColor: `${accent}15` }]}>
            <Text style={[styles.balanceBadgeText, { color: accent }]}>
              {t('merchant.yourStamps', { count: merchant.cardBalance })}
            </Text>
          </View>
        )}
      </View>

      {validityText && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(6), marginTop: hp(10) }}>
          <Clock size={ms(13)} color={theme.textMuted} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: ms(12), color: theme.textMuted }}>
            {validityText}
          </Text>
        </View>
      )}

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
                {t('merchant.stampsCost', { count: reward.cout })}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </LinearGradient>
  );
}

export default React.memo(MerchantLoyaltyRewards);
