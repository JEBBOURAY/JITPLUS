import { memo, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import { Text } from '@/components/AppText';
import { Stamp, Clock, Check } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import FicheSection from './FicheSection';
import MerchantStampProgress from './MerchantStampProgress';
import MerchantWelcomeBanner from './MerchantWelcomeBanner';
import RewardThumb from './RewardThumb';
import type { MerchantLoyalty } from './useMerchantLoyalty';

const REWARDS_PREVIEW = 3;

interface Props {
  loyalty: MerchantLoyalty;
  accent: string;
}

/** Loyalty tab: how it works (visitor) or progress (member), then every reward. */
function MerchantLoyaltyCard({ loyalty, accent }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const [showAll, setShowAll] = useState(false);
  const { rewards, isMember, balance, earnLine, validityLine } = loyalty;

  const visibleRewards = showAll ? rewards : rewards.slice(0, REWARDS_PREVIEW);
  // A member's progress already names the next reward: a list of that one reward would repeat it.
  const showRewards = !(isMember && rewards.length === 1);
  const toggleRewards = () => {
    haptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAll((v) => !v);
  };

  return (
    <>
      <FicheSection title={t('merchant.loyaltyProgram')}>
        <MerchantWelcomeBanner loyalty={loyalty} accent={accent} />
        {isMember ? (
          <MerchantStampProgress loyalty={loyalty} accent={accent} />
        ) : (
          <View style={styles.steps}>
            {[t('merchant.howStep1'), earnLine, t('merchant.howStep3')].map((label, i) => (
              <View key={i} style={styles.step}>
                <View style={[styles.stepNumber, { borderColor: theme.border }]}>
                  <Text style={[styles.stepNumberText, { color: theme.text, fontFamily: fonts.semibold }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.regular }]}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {(isMember || validityLine) && (
          <View style={styles.infoLines}>
            {isMember && (
              <View style={styles.infoLine}>
                <Stamp size={ms(16)} color={theme.textMuted} strokeWidth={1.75} />
                <Text style={[styles.infoText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{earnLine}</Text>
              </View>
            )}
            {validityLine && (
              <View style={styles.infoLine}>
                <Clock size={ms(16)} color={theme.textMuted} strokeWidth={1.75} />
                <Text style={[styles.infoText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{validityLine}</Text>
              </View>
            )}
          </View>
        )}
      </FicheSection>

      {showRewards && (
        <FicheSection title={t('merchant.rewardsSection')} variant="list">
          {visibleRewards.map((reward, i) => {
            const ready = isMember && reward.cout <= balance;
            return (
              <View key={reward.id} style={[styles.reward, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <RewardThumb imageUrl={reward.imageUrl} />
                <View style={styles.flex}>
                  <Text style={[styles.rewardTitle, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2}>
                    {reward.titre}
                  </Text>
                  {!!reward.description && (
                    <Text style={[styles.rewardDesc, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
                      {reward.description}
                    </Text>
                  )}
                </View>
                {ready ? (
                  <View style={styles.cost}>
                    <Check size={ms(14)} color={theme.success} strokeWidth={2.5} />
                    <Text style={[styles.costText, { color: theme.success, fontFamily: fonts.semibold }]}>{t('merchant.rewardReady')}</Text>
                  </View>
                ) : (
                  <Text style={[styles.costText, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
                    {t(pluralKey('merchant.stampsCost', reward.cout), { count: reward.cout })}
                  </Text>
                )}
              </View>
            );
          })}

          {rewards.length > REWARDS_PREVIEW && (
            <Pressable
              onPress={toggleRewards}
              style={[styles.toggle, { borderTopColor: theme.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.toggleText, { color: theme.primary, fontFamily: fonts.semibold }]}>
                {showAll ? t('merchant.showLess') : t('merchant.seeAllRewards', { count: rewards.length })}
              </Text>
            </Pressable>
          )}
        </FicheSection>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  steps: { gap: hp(12) },
  step: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  stepNumber: { width: ms(26), height: ms(26), borderRadius: ms(13), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: fontSize.sm },
  stepText: { flex: 1, fontSize: fontSize.md, lineHeight: ms(22) },

  infoLines: { gap: hp(8), marginTop: hp(16) },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  infoText: { flex: 1, fontSize: fontSize.sm, lineHeight: ms(18) },

  reward: { flexDirection: 'row', alignItems: 'center', gap: wp(12), paddingVertical: hp(10) },
  rewardTitle: { fontSize: fontSize.md, lineHeight: ms(20) },
  rewardDesc: { fontSize: fontSize.sm, lineHeight: ms(18), marginTop: hp(2) },
  cost: { flexDirection: 'row', alignItems: 'center', gap: wp(4) },
  costText: { fontSize: fontSize.sm },
  toggle: { minHeight: ms(44), justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  toggleText: { fontSize: fontSize.sm },
});

export default memo(MerchantLoyaltyCard);
