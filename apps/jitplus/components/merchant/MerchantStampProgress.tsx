import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Check, Gift } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms } from '@/utils/responsive';
import type { MerchantLoyalty } from './useMerchantLoyalty';

/** Above this goal the stamp dots no longer fit nicely: show a bar instead. */
const MAX_STAMP_DOTS = 12;

/** Member progress toward the next reward, and a reminder when one can already be claimed. */
function MerchantStampProgress({ loyalty, accent }: { loyalty: MerchantLoyalty; accent: string }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const { rewards, balance, nextReward, goal, earned } = loyalty;
  const rewardReady = rewards[0].cout <= balance;

  return (
    <View>
      <View style={styles.top}>
        <Text style={[styles.count, { color: theme.text, fontFamily: fonts.bold }]}>
          {nextReward ? (
            <>
              {earned}
              <Text style={[styles.countGoal, { color: theme.textMuted, fontFamily: fonts.medium }]}>{` / ${goal}`}</Text>
            </>
          ) : t(pluralKey('merchant.yourStamps', balance), { count: balance })}
        </Text>
        {nextReward && (
          <Text style={[styles.remaining, { color: theme.textMuted, fontFamily: fonts.medium }]}>
            {t('merchant.stampsToGo', { count: goal - balance })}
          </Text>
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
                  filled ? { backgroundColor: accent, borderColor: accent } : { borderColor: theme.border },
                ]}
              >
                {filled && <Check size={ms(12)} color="#fff" strokeWidth={3} />}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={[styles.track, { backgroundColor: theme.bgInput }]}>
          <View style={[styles.fill, { backgroundColor: accent, width: `${(earned / goal) * 100}%` }]} />
        </View>
      )}

      {nextReward && (
        <Text style={[styles.nextReward, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={2}>
          {t('merchant.nextReward', { reward: nextReward.titre })}
        </Text>
      )}

      {rewardReady && (
        <View style={styles.ready}>
          <Gift size={ms(16)} color={theme.success} strokeWidth={2} />
          <Text style={[styles.readyText, { color: theme.success, fontFamily: fonts.semibold }]}>
            {t('merchant.rewardReadyBanner')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: wp(10) },
  count: { fontSize: ms(24) },
  countGoal: { fontSize: ms(16) },
  remaining: { fontSize: ms(13) },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(6), marginTop: hp(12) },
  dot: { width: ms(22), height: ms(22), borderRadius: ms(11), borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  track: { height: ms(6), borderRadius: ms(3), overflow: 'hidden', marginTop: hp(12) },
  fill: { height: '100%', borderRadius: ms(3) },
  nextReward: { fontSize: ms(14), lineHeight: ms(20), marginTop: hp(10) },
  ready: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginTop: hp(10) },
  readyText: { flex: 1, fontSize: ms(14), lineHeight: ms(20) },
});

export default memo(MerchantStampProgress);
