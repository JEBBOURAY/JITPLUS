import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Animated, Easing, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, ChevronRight, Coins, MapPin } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { LoyaltyCard } from '@/types';
import GlassCard from '@/components/GlassCard';
import { getCategoryEmoji } from '@/utils/categories';
import { ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { timeAgo } from '@/utils/date';
import {
  PROGRESS_ANIM_DURATION_MS, PROGRESS_ANIM_DELAY_MS,
  MAX_VISIBLE_STAMPS, DEFAULT_STAMPS_GOAL,
} from '@/constants';
import { homeStyles as styles } from './homeStyles';

const JITPLUS_LOGO = require('@/assets/images/jitpluslogo.png');
const PROGRESS_BAR_ORIGIN = { transformOrigin: 'left center' } as const;

function getNextMilestone(pts: number): number {
  const milestones = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  return milestones.find((m) => m > pts) ?? Math.ceil((pts + 1) / 1000) * 1000;
}

const CardItem = React.memo(function CardItem({
  card,
  onPress,
  t,
  isClosest,
  locale,
}: {
  card: LoyaltyCard;
  onPress: () => void;
  t: (scope: string, options?: Record<string, unknown>) => string;
  isClosest?: boolean;
  locale?: string;
}) {
  const theme = useTheme();
  const isStamps = card.merchant?.loyaltyType === 'STAMPS';
  const isMerchantUnavailable = !card.merchant?.id || !card.merchant?.nomBoutique;
  const [logoError, setLogoError] = useState(false);

  const balance = card.balance ?? 0;

  // ── STAMPS ──
  const goal = card.merchant?.minRewardCost ?? card.merchant?.rewards?.[0]?.cout ?? DEFAULT_STAMPS_GOAL;
  const stampsEarned = Math.min(balance, goal);
  const stampsRemaining = Math.max(0, goal - stampsEarned);
  const stampsComplete = stampsEarned >= goal;

  // ── POINTS ──
  const minRewardCost = card.merchant?.minRewardCost;
  const nextTarget = minRewardCost || getNextMilestone(balance);
  const pointsProgress = Math.min(balance / nextTarget, 1);
  const pointsPct = Math.round(pointsProgress * 100);
  const pointsComplete = balance >= nextTarget;

  const progressAnim = useRef(new Animated.Value(0)).current;
  const animTarget = isStamps ? stampsEarned / goal : pointsProgress;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: animTarget,
      duration: PROGRESS_ANIM_DURATION_MS,
      delay: PROGRESS_ANIM_DELAY_MS,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animTarget]);

  const visibleStamps = Math.min(goal, MAX_VISIBLE_STAMPS);
  const stampDots = useMemo(
    () => Array.from({ length: visibleStamps }, (_, i) => i < stampsEarned),
    [visibleStamps, stampsEarned],
  );

  const stampStyles = useMemo(() => ({
    filledLogo: { borderColor: palette.violet, backgroundColor: theme.bgElevated },
    emptyLogo: { borderColor: theme.borderLight, backgroundColor: theme.bgCard },
    filledNoLogo: { backgroundColor: palette.violet, borderColor: palette.violet },
    emptyNoLogo: { backgroundColor: 'transparent' as const, borderColor: theme.borderLight },
    logoFilled: { opacity: 1 },
    logoEmpty: { opacity: 0.18 },
  }), [theme.bgElevated, theme.bgCard, theme.borderLight]);

  const lastScanLabel = useMemo(
    () => timeAgo(card.updatedAt || card.createdAt, locale),
    [card.updatedAt, card.createdAt, locale],
  );

  return (
    <GlassCard onPress={onPress}>
      <View
        style={[styles.cardItem, { backgroundColor: theme.bgCard }]}
        accessibilityRole="button"
        accessibilityLabel={t('home.cardAccessibility', { name: card.merchant?.nomBoutique || t('common.shop') })}
      >
        <LinearGradient
          colors={[palette.violetDark, palette.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.accentBar}
        />

        <View style={[styles.cardIcon, { backgroundColor: theme.primaryBg }]}>
          {card.merchant?.logoUrl && !logoError ? (
            <Image
              source={resolveImageUrl(card.merchant.logoUrl)}
              style={styles.merchantLogo}
              contentFit="cover"
              cachePolicy="disk"
              recyclingKey={card.merchant.logoUrl}
              onError={() => setLogoError(true)}
            />
          ) : (
            <Text style={styles.cardEmoji}>{getCategoryEmoji(card.merchant?.categorie)}</Text>
          )}
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={1}>
              {isMerchantUnavailable ? t('home.unavailableMerchantName') : (card.merchant?.nomBoutique || t('common.shop'))}
            </Text>
            <RNImage
              source={JITPLUS_LOGO}
              style={styles.cardLogo}
              resizeMode="contain"
            />
          </View>

          {isClosest && (
            <View style={[styles.closestBadge, { backgroundColor: `${palette.emerald}18` }]}>
              <MapPin size={ms(9)} color={palette.emerald} strokeWidth={1.5} />
              <Text style={[styles.closestBadgeText, { color: palette.emerald }]}>
                {t('home.nearestBadge')}
              </Text>
            </View>
          )}

          {isMerchantUnavailable ? (
            <View style={[styles.unavailableBanner, { backgroundColor: `${theme.danger}10` }]}>
              <AlertCircle size={ms(12)} color={theme.danger} strokeWidth={1.8} />
              <Text style={[styles.unavailableText, { color: theme.danger }]}>
                {t('home.unavailableMerchantMessage')}
              </Text>
            </View>
          ) : isStamps ? (
            <>
              <View style={styles.stampsGrid}>
                {stampDots.map((filled, i) => {
                  const hasLogo = !!card.merchant?.logoUrl && !logoError;
                  if (hasLogo) {
                    return (
                      <View
                        key={i}
                        style={[
                          styles.stampDot,
                          filled ? stampStyles.filledLogo : stampStyles.emptyLogo,
                        ]}
                      >
                        <Image
                          source={resolveImageUrl(card.merchant!.logoUrl!)}
                          style={[styles.stampLogo, filled ? stampStyles.logoFilled : stampStyles.logoEmpty]}
                          contentFit="cover"
                          cachePolicy="disk"
                        />
                      </View>
                    );
                  }
                  return (
                    <View
                      key={i}
                      style={[
                        styles.stampDot,
                        filled ? stampStyles.filledNoLogo : stampStyles.emptyNoLogo,
                      ]}
                    >
                      {filled && <Text style={styles.stampCheck}>✓</Text>}
                    </View>
                  );
                })}
                {goal > 20 && (
                  <Text style={[styles.stampsExtra, { color: theme.textMuted }]}>+{goal - 20}</Text>
                )}
              </View>

              {stampsComplete ? (
                <View style={[styles.rewardBanner, { backgroundColor: `${palette.emerald}22` }]}>
                  <Text style={[styles.rewardBannerText, { color: palette.emerald }]}>
                    {t('home.rewardReady')}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.stampsMeta, { color: theme.textMuted }]}>
                  {t('home.stampsRemaining', { count: stampsRemaining })}
                </Text>
              )}
            </>
          ) : (
            <>
              <View style={styles.pointsTopRow}>
                <View style={styles.pointsValueRow}>
                  <Coins size={ms(12)} color={palette.violet} strokeWidth={1.5} />
                  <Text style={[styles.pointsValue, { color: palette.violet }]}>
                    {balance.toLocaleString('fr-MA')} pts
                  </Text>
                </View>
                {pointsComplete ? (
                  <View style={[styles.rewardBadge, { backgroundColor: `${palette.emerald}22` }]}>
                    <Text style={[styles.rewardBadgeText, { color: palette.emerald }]}>
                      {t('home.rewardReady')}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.pointsPct, { color: theme.textMuted }]}>{pointsPct}%</Text>
                )}
              </View>

              <View style={[styles.pointsBar, { backgroundColor: theme.borderLight }]}>
                <Animated.View
                  style={[
                    styles.pointsBarFill,
                    {
                      transform: [{ scaleX: progressAnim }],
                      backgroundColor: pointsComplete ? palette.emerald : palette.violet,
                    },
                    PROGRESS_BAR_ORIGIN,
                  ]}
                />
              </View>

              {!pointsComplete && (
                <Text style={[styles.pointsTargetLabel, { color: theme.textMuted }]} numberOfLines={1}>
                  {minRewardCost
                    ? t('home.pointsProgress', {
                        current: balance.toLocaleString('fr-MA'),
                        target: nextTarget.toLocaleString('fr-MA'),
                      })
                    : t('home.pointsMilestone', { target: nextTarget.toLocaleString('fr-MA') })}
                </Text>
              )}
            </>
          )}

          <Text style={[styles.lastScanText, { color: theme.textMuted }]}>
            {t('home.lastScan')} {lastScanLabel}
          </Text>
        </View>

        {!isMerchantUnavailable && <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} />}
      </View>
    </GlassCard>
  );
});

export default CardItem;
