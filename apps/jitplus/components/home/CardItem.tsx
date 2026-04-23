import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, ChevronRight, Coins, Gift, MapPin } from 'lucide-react-native';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import { LoyaltyCard } from '@/types';
import GlassCard from '@/components/GlassCard';
import { getCategoryEmoji } from '@/utils/categories';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { timeAgo } from '@/utils/date';
import {
  PROGRESS_ANIM_DURATION_MS, PROGRESS_ANIM_DELAY_MS,
  MAX_VISIBLE_STAMPS, DEFAULT_STAMPS_GOAL,
} from '@/constants';

const PROGRESS_BAR_ORIGIN = { transformOrigin: 'left center' } as const;
const JITPLUS_LOGO = require('@/assets/images/jitpluslogo.png');

/** Next-milestone helper for POINTS cards with no configured reward */
const MILESTONES = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000] as const;
function getNextMilestone(pts: number): number {
  return MILESTONES.find((m) => m > pts) ?? Math.ceil((pts + 1) / 1000) * 1000;
}

const CardItem = React.memo(function CardItem({
  card,
  onPress,
  t,
  isClosest,
  locale,
  searchHighlight,
  theme,
}: {
  card: LoyaltyCard;
  onPress: (merchantId: string) => void;
  t: (scope: string, options?: Record<string, unknown>) => string;
  isClosest?: boolean;
  locale?: string;
  searchHighlight?: string;
  theme: ThemeColors;
}) {
  const isStamps = card.merchant?.loyaltyType === 'STAMPS';
  const isMerchantUnavailable = !card.merchant?.id || !card.merchant?.nomBoutique;
  const [logoError, setLogoError] = useState(false);

  const handlePress = useCallback(() => {
    if (isMerchantUnavailable) return;
    onPress(card.merchantId);
  }, [isMerchantUnavailable, onPress, card.merchantId]);

  const balance = card.balance ?? 0;

  // ── STAMPS ──
  const goal = card.merchant?.minRewardCost ?? card.merchant?.stampsForReward ?? DEFAULT_STAMPS_GOAL;
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

  // ── Reward celebration: glow + pulse ──
  const rewardReady = stampsComplete || pointsComplete;
  const glowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!rewardReady) { glowAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewardReady]);
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.13] });
  const pulseScale = glowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] });
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
  const dotSize = goal <= 10 ? ms(26) : goal <= 15 ? ms(22) : ms(18);
  const dotRadius = dotSize / 2;
  const dotBorder = goal <= 15 ? 1.5 : 1;

  const stampStyles = useMemo(() => ({
    filledLogo: { borderColor: palette.violet, backgroundColor: theme.bgElevated },
    emptyLogo: { borderColor: theme.borderLight, backgroundColor: theme.bgCard },
    filledNoLogo: { backgroundColor: palette.violet, borderColor: palette.violet },
    emptyNoLogo: { backgroundColor: 'transparent' as const, borderColor: theme.borderLight },
    logoFilled: { opacity: 1 },
    logoEmpty: { opacity: 0.18 },
  }), [theme.bgElevated, theme.bgCard, theme.borderLight]);

  // Hoist once per render instead of per-stamp (perf)
  const logoUrl = card.merchant?.logoUrl;
  const stampHasLogo = !!logoUrl && !logoError;

  const lastScanLabel = useMemo(
    () => timeAgo(card.updatedAt || card.createdAt, locale),
    [card.updatedAt, card.createdAt, locale],
  );

  const formatNumber = useCallback((num: number) => {
    try {
      return new Intl.NumberFormat(locale || 'fr-FR').format(num);
    } catch {
      return num.toString();
    }
  }, [locale]);

  return (
    <GlassCard onPress={handlePress}>
      <View
        style={[styles.cardItem, { backgroundColor: theme.bgCard }]}
        accessibilityRole="button"
        accessibilityLabel={t('home.cardAccessibility', { name: card.merchant?.nomBoutique || t('common.shop') })}
      >
        {rewardReady && (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: '#F59E0B', borderRadius: 16, opacity: glowOpacity }]}
          />
        )}
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
          {/* Name row */}
          <View style={styles.cardNameRow}>
            <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={1}>
              {isMerchantUnavailable
                ? t('home.unavailableMerchantName')
                : (() => {
                    const name = card.merchant?.nomBoutique || t('common.shop');
                    if (!searchHighlight) return name;
                    const idx = name.toLowerCase().indexOf(searchHighlight.toLowerCase());
                    if (idx < 0) return name;
                    return (
                      <>
                        {name.slice(0, idx)}
                        <Text style={{ color: palette.violet, fontWeight: '800' }}>
                          {name.slice(idx, idx + searchHighlight.length)}
                        </Text>
                        {name.slice(idx + searchHighlight.length)}
                      </>
                    );
                  })()
              }
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
              <AlertCircle size={ms(12)} color={theme.danger} strokeWidth={1.5} />
              <Text style={[styles.unavailableText, { color: theme.danger }]}>
                {t('home.unavailableMerchantMessage')}
              </Text>
            </View>
          ) : isStamps ? (
            <>
              <View style={styles.stampsGrid}>
                {stampDots.map((filled, i) => {
                  if (stampHasLogo && logoUrl) {
                    return (
                      <View
                        key={`stamp-${i}`}
                        style={[
                          { width: dotSize, height: dotSize, borderRadius: dotRadius, borderWidth: dotBorder, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
                          filled ? stampStyles.filledLogo : stampStyles.emptyLogo,
                        ]}
                      >
                        <Image
                          source={resolveImageUrl(logoUrl)}
                          style={[{ width: '100%', height: '100%', borderRadius: dotRadius }, filled ? stampStyles.logoFilled : stampStyles.logoEmpty]}
                          contentFit="cover"
                          cachePolicy="disk"
                        />
                      </View>
                    );
                  }
                  return (
                    <View
                      key={`stamp-${i}`}
                      style={[
                        { width: dotSize, height: dotSize, borderRadius: dotRadius, borderWidth: dotBorder, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
                        filled ? stampStyles.filledNoLogo : stampStyles.emptyNoLogo,
                      ]}
                    >
                      {filled && <Text style={[styles.stampCheck, goal > 15 && { fontSize: ms(9) }]}>✓</Text>}
                    </View>
                  );
                })}
                {goal > MAX_VISIBLE_STAMPS && (
                  <Text style={[styles.stampsExtra, { color: theme.textMuted }]}>+{goal - MAX_VISIBLE_STAMPS}</Text>
                )}
              </View>

              {stampsComplete ? (
                <Animated.View style={[styles.rewardBanner, { backgroundColor: `${palette.emerald}22`, transform: [{ scale: pulseScale }] }]}>
                  <Gift size={ms(12)} color={palette.emerald} strokeWidth={1.5} />
                  <Text style={[styles.rewardBannerText, { color: palette.emerald }]}>
                    {t('home.rewardReady')}
                  </Text>
                </Animated.View>
              ) : (
                <Text style={[styles.stampsMeta, { color: theme.textMuted }]}>
                  {t('home.stampsEarned', { earned: stampsEarned, total: goal })}
                </Text>
              )}
            </>
          ) : (
            <>
              <View style={styles.pointsTopRow}>
                <View style={styles.pointsValueRow}>
                  <Coins size={ms(12)} color={palette.gold} strokeWidth={1.5} />
                  <Text style={[styles.pointsValue, { color: palette.violet }]}>
                    {t('merchant.yourPoints', { count: formatNumber(balance) })}
                  </Text>
                </View>
                {pointsComplete ? (
                  <Animated.View style={[styles.rewardBadge, { backgroundColor: `${palette.emerald}22`, transform: [{ scale: pulseScale }] }]}>
                    <Gift size={ms(11)} color={palette.emerald} strokeWidth={1.5} />
                    <Text style={[styles.rewardBadgeText, { color: palette.emerald }]}>
                      {t('home.rewardReady')}
                    </Text>
                  </Animated.View>
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
                        current: formatNumber(balance),
                        target: formatNumber(nextTarget),
                      })
                    : t('home.pointsMilestone', { target: formatNumber(nextTarget) })}
                </Text>
              )}
            </>
          )}
          <Text style={[styles.lastScanText, { color: theme.textMuted }]}>
            {t('home.lastScan')} {lastScanLabel}
          </Text>
        </View>

        {!isMerchantUnavailable && <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={2} />}
      </View>
    </GlassCard>
  );
});

export default CardItem;

const styles = StyleSheet.create({
  cardItem: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, padding: wp(14), paddingLeft: wp(10), marginBottom: hp(12),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    overflow: 'hidden' as const,
  },
  accentBar: {
    position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: ms(4),
    borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg,
  },
  cardIcon: { width: ms(50), height: ms(50), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center', marginLeft: wp(4), marginRight: wp(14), overflow: 'hidden' as const },
  cardEmoji: { fontSize: ms(22) },
  merchantLogo: { width: ms(50), height: ms(50), borderRadius: ms(14) },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: hp(4) },
  cardName: { fontSize: fontSize.md, fontWeight: '700', letterSpacing: -0.2, flex: 1 },
  cardLogo: { width: ms(18), height: ms(18), marginLeft: wp(6), opacity: 0.4 },

  // Stamps
  stampsGrid: {
    flexDirection: 'row' as const, flexWrap: 'wrap' as const,
    gap: wp(4), marginTop: hp(4), marginBottom: hp(4),
  },
  stampCheck: { color: '#fff', fontSize: ms(12), fontWeight: '700' },
  stampsExtra: { fontSize: fontSize.xs, fontWeight: '600', alignSelf: 'center' as const },
  stampsMeta: { fontSize: fontSize.xs, fontWeight: '500', marginTop: hp(1) },

  // Points
  pointsTopRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    justifyContent: 'space-between' as const, marginTop: hp(4), marginBottom: hp(5),
  },
  pointsValueRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(4) },
  pointsValue: { fontSize: fontSize.sm, fontWeight: '700' },
  pointsPct: { fontSize: fontSize.xs, fontWeight: '600' },
  pointsBar: { height: ms(7), borderRadius: ms(4), overflow: 'hidden' as const, marginBottom: hp(4) },
  pointsBarFill: { width: '100%' as const, height: '100%' as const, borderRadius: ms(4) },
  pointsTargetLabel: { fontSize: fontSize.xs, fontWeight: '500' },

  // Shared indicators
  rewardBanner: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(4),
    marginTop: hp(4), paddingVertical: hp(4), paddingHorizontal: wp(10),
    borderRadius: ms(8), alignSelf: 'flex-start' as const,
  },
  rewardBannerText: { fontSize: fontSize.xs, fontWeight: '700' },
  rewardBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(3), paddingVertical: hp(2), paddingHorizontal: wp(8), borderRadius: ms(8) },
  rewardBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  unavailableBanner: {
    marginTop: hp(4), paddingVertical: hp(5), paddingHorizontal: wp(10),
    borderRadius: ms(8), alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(6),
  },
  unavailableText: { fontSize: fontSize.xs, fontWeight: '600' },

  // Closest badge
  closestBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(4),
    paddingHorizontal: wp(8), paddingVertical: hp(3), borderRadius: ms(8),
    alignSelf: 'flex-start' as const, marginTop: hp(2), marginBottom: hp(3),
  },
  closestBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  // Last scan
  lastScanText: { fontSize: fontSize.xs, fontWeight: '500', marginTop: hp(3), opacity: 0.75 },
});
