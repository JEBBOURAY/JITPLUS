import React, { memo, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import { Image } from 'expo-image';
import { Stamp, Gift, Clock, Check, PartyPopper, ChevronDown } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { resolveImageUrl } from '@/utils/imageUrl';
import { formatDate } from '@/utils/date';
import { DEFAULT_STAMPS_GOAL } from '@/constants';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant, MerchantReward } from '@/types';
import MerchantSection from './MerchantSection';

/** Above this goal the stamp dots no longer fit nicely: show a bar instead. */
const MAX_STAMP_DOTS = 12;
const REWARDS_PREVIEW = 3;

interface Props {
  merchant: Merchant;
}

/** Loyalty programme: how it works (visitor) or progress toward the next reward (member), then the rewards. */
function MerchantLoyaltyCard({ merchant }: Props) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const fonts = useAppFonts();
  const accent = getMerchantAccent(merchant.themeColor);
  const [showAll, setShowAll] = useState(false);

  const rewards = useMemo<MerchantReward[]>(() => {
    const list = (merchant.rewards ?? []).filter((r) => r.cout > 0).sort((a, b) => a.cout - b.cout);
    if (list.length) return list;
    return [{ id: 'default', titre: t('merchant.defaultReward'), cout: merchant.stampsForReward || DEFAULT_STAMPS_GOAL }];
  }, [merchant.rewards, merchant.stampsForReward, t]);

  const isMember = !!merchant.hasCard;
  const balance = isMember ? Math.max(0, merchant.cardBalance ?? 0) : 0;
  const nextReward = rewards.find((r) => r.cout > balance) ?? null;
  const hasReadyReward = rewards[0].cout <= balance;
  const goal = nextReward?.cout ?? rewards[rewards.length - 1].cout;
  const earned = Math.min(balance, goal);

  const earnLine = merchant.stampEarningMode === 'PER_AMOUNT' && merchant.amountPerStamp
    ? t('merchant.earnPerAmount', { amount: merchant.amountPerStamp })
    : t('merchant.earnPerVisit');
  const validityLine = merchant.stampValidityDays
    ? isMember && merchant.cardStampsExpireAt
      ? t('merchant.stampsExpireOn', { date: formatDate(merchant.cardStampsExpireAt, locale) })
      : t('merchant.stampsValidity', { days: merchant.stampValidityDays })
    : null;

  const visibleRewards = showAll ? rewards : rewards.slice(0, REWARDS_PREVIEW);
  const toggleRewards = () => {
    haptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAll((v) => !v);
  };

  return (
    <MerchantSection title={t('merchant.loyaltyProgram')} icon={Stamp} accent={accent}>
      {isMember ? (
        <>
          <View style={[styles.progress, { backgroundColor: `${accent}10`, borderColor: `${accent}26` }]}>
            <View style={styles.progressTop}>
              <View style={styles.flex}>
                <Text style={[styles.overline, { color: theme.textMuted, fontFamily: fonts.semibold }]}>
                  {t('merchant.progressTitle')}
                </Text>
                <Text style={[styles.count, { color: theme.text, fontFamily: fonts.bold }]}>
                  {nextReward ? (
                    <>
                      <Text style={{ color: accent }}>{earned}</Text>
                      <Text style={[styles.countGoal, { color: theme.textMuted }]}>{` / ${goal}`}</Text>
                    </>
                  ) : (
                    <Text style={{ color: accent }}>{t('merchant.yourStamps', { count: balance })}</Text>
                  )}
                </Text>
              </View>
              {nextReward && (
                <View style={[styles.pill, { backgroundColor: accent }]}>
                  <Text style={[styles.pillText, { color: '#fff', fontFamily: fonts.bold }]}>
                    {t('merchant.stampsToGo', { count: goal - balance })}
                  </Text>
                </View>
              )}
            </View>

            {goal <= MAX_STAMP_DOTS ? (
              <View style={styles.dots}>
                {Array.from({ length: goal }, (_, i) => {
                  const filled = i < earned;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        filled
                          ? { backgroundColor: accent, borderColor: accent }
                          : { backgroundColor: theme.bgCard, borderColor: `${accent}40` },
                      ]}
                    >
                      {filled && <Check size={ms(13)} color="#fff" strokeWidth={3} />}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[styles.track, { backgroundColor: `${accent}1F` }]}>
                <View style={[styles.fill, { backgroundColor: accent, width: `${(earned / goal) * 100}%` }]} />
              </View>
            )}

            {nextReward && (
              <Text style={[styles.nextReward, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={2}>
                {t('merchant.nextReward', { reward: nextReward.titre })}
              </Text>
            )}
          </View>

          {hasReadyReward && (
            <View style={[styles.readyBanner, { backgroundColor: `${theme.success}14`, borderColor: `${theme.success}33` }]}>
              <PartyPopper size={ms(18)} color={theme.success} strokeWidth={2} />
              <Text style={[styles.readyText, { color: theme.success, fontFamily: fonts.semibold }]}>
                {t('merchant.rewardReadyBanner')}
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.steps}>
          {[t('merchant.howStep1'), earnLine, t('merchant.howStep3')].map((label, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: `${accent}14` }]}>
                <Text style={[styles.stepNumberText, { color: accent, fontFamily: fonts.bold }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.medium }]}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      {(isMember || validityLine) && (
        <View style={styles.infoLines}>
          {isMember && (
            <View style={styles.infoLine}>
              <Stamp size={ms(14)} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.infoText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{earnLine}</Text>
            </View>
          )}
          {validityLine && (
            <View style={styles.infoLine}>
              <Clock size={ms(14)} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.infoText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{validityLine}</Text>
            </View>
          )}
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <Text style={[styles.subheading, { color: theme.text, fontFamily: fonts.bold }]}>{t('merchant.rewardsSection')}</Text>
      <View style={styles.rewards}>
        {visibleRewards.map((reward) => {
          const ready = isMember && reward.cout <= balance;
          return (
            <View key={reward.id} style={[styles.reward, { borderColor: ready ? `${theme.success}55` : theme.border }]}>
              <View style={[styles.rewardThumb, { backgroundColor: `${accent}12` }]}>
                {reward.imageUrl ? (
                  <Image
                    source={resolveImageUrl(reward.imageUrl)}
                    style={styles.rewardImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={reward.imageUrl}
                  />
                ) : (
                  <Gift size={ms(20)} color={accent} strokeWidth={1.8} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.rewardTitle, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2}>
                  {reward.titre}
                </Text>
                {!!reward.description && (
                  <Text style={[styles.rewardDesc, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
                    {reward.description}
                  </Text>
                )}
              </View>
              {ready ? (
                <View style={[styles.rewardBadge, { backgroundColor: `${theme.success}18` }]}>
                  <Check size={ms(12)} color={theme.success} strokeWidth={3} />
                  <Text style={[styles.rewardBadgeText, { color: theme.success, fontFamily: fonts.bold }]}>
                    {t('merchant.rewardReady')}
                  </Text>
                </View>
              ) : (
                <View style={[styles.rewardBadge, { backgroundColor: `${accent}14` }]}>
                  <Text style={[styles.rewardBadgeText, { color: accent, fontFamily: fonts.bold }]} numberOfLines={1}>
                    {t('merchant.stampsCost', { count: reward.cout })}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {rewards.length > REWARDS_PREVIEW && (
        <Pressable onPress={toggleRewards} style={styles.toggle} accessibilityRole="button" hitSlop={6}>
          <Text style={[styles.toggleText, { color: accent, fontFamily: fonts.semibold }]}>
            {showAll ? t('merchant.showLess') : t('merchant.seeAllRewards', { count: rewards.length })}
          </Text>
          <ChevronDown size={ms(16)} color={accent} strokeWidth={2.2} style={showAll ? styles.chevronUp : undefined} />
        </Pressable>
      )}
    </MerchantSection>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: { borderRadius: ms(18), borderWidth: 1, padding: wp(14) },
  progressTop: { flexDirection: 'row', alignItems: 'flex-start', gap: wp(10) },
  overline: { fontSize: ms(11), textTransform: 'uppercase', letterSpacing: 0.6 },
  count: { fontSize: ms(28), marginTop: hp(2) },
  countGoal: { fontSize: ms(18) },
  pill: { paddingHorizontal: wp(10), paddingVertical: hp(5), borderRadius: 999 },
  pillText: { fontSize: ms(12) },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(7), marginTop: hp(12) },
  dot: { width: ms(24), height: ms(24), borderRadius: ms(12), borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  track: { height: ms(10), borderRadius: ms(5), overflow: 'hidden', marginTop: hp(14) },
  fill: { height: '100%', borderRadius: ms(5) },
  nextReward: { fontSize: ms(13), lineHeight: ms(19), marginTop: hp(12) },
  readyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    marginTop: hp(10), padding: wp(12), borderRadius: ms(14), borderWidth: 1,
  },
  readyText: { flex: 1, fontSize: ms(13), lineHeight: ms(19) },

  steps: { gap: hp(12) },
  step: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  stepNumber: { width: ms(30), height: ms(30), borderRadius: ms(15), alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: ms(13) },
  stepText: { flex: 1, fontSize: ms(14), lineHeight: ms(20) },

  infoLines: { gap: hp(6), marginTop: hp(12) },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  infoText: { flex: 1, fontSize: ms(12), lineHeight: ms(17) },

  divider: { height: StyleSheet.hairlineWidth, marginVertical: hp(16) },
  subheading: { fontSize: ms(14), marginBottom: hp(10) },
  rewards: { gap: hp(8) },
  reward: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    padding: wp(10), borderRadius: ms(16), borderWidth: 1,
  },
  rewardThumb: { width: ms(46), height: ms(46), borderRadius: ms(13), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rewardImage: { width: '100%', height: '100%' },
  rewardTitle: { fontSize: ms(14), lineHeight: ms(19) },
  rewardDesc: { fontSize: ms(12), marginTop: hp(2) },
  rewardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(4),
    paddingHorizontal: wp(10), paddingVertical: hp(5), borderRadius: 999,
  },
  rewardBadgeText: { fontSize: ms(12) },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(4), marginTop: hp(12) },
  toggleText: { fontSize: ms(13) },
  chevronUp: { transform: [{ rotate: '180deg' }] },
});

export default memo(MerchantLoyaltyCard);
