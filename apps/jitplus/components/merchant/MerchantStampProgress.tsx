import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Check, Gift, Lock } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import type { MerchantLoyalty } from './useMerchantLoyalty';

/** Above this goal the stamp dots no longer fit nicely: show a bar instead. */
const MAX_STAMP_DOTS = 12;

/** Member progress toward the next reward, and a reminder when one can already be claimed. */
function MerchantStampProgress({ loyalty, accent }: { loyalty: MerchantLoyalty; accent: string }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const { rewards, balance, nextReward, goal, earned, lockedWelcome } = loyalty;
  const lockedEnd = earned + (lockedWelcome?.stamps ?? 0);
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
            const locked = !filled && i < lockedEnd;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  filled
                    ? { backgroundColor: accent, borderColor: accent }
                    : locked
                      ? { borderColor: accent, borderStyle: 'dashed' }
                      : { borderColor: theme.border },
                ]}
              >
                {filled && <Check size={ms(12)} color="#fff" strokeWidth={3} />}
                {locked && <Lock size={ms(10)} color={accent} strokeWidth={2.5} />}
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
        <View style={[styles.ready, { backgroundColor: `${theme.success}14` }]}>
          <Gift size={ms(20)} color={theme.success} strokeWidth={1.75} />
          <Text style={[styles.readyText, { color: theme.text, fontFamily: fonts.medium }]}>
            {t('merchant.rewardReadyBanner')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: wp(10) },
  count: { fontSize: fontSize['3xl'], lineHeight: ms(34), letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  countGoal: { fontSize: fontSize.lg },
  remaining: { fontSize: fontSize.sm },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(8), marginTop: hp(12) },
  dot: { width: ms(24), height: ms(24), borderRadius: ms(12), borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  track: { height: ms(8), borderRadius: ms(4), overflow: 'hidden', marginTop: hp(12) },
  fill: { height: '100%', borderRadius: ms(4) },
  nextReward: { fontSize: fontSize.md, lineHeight: ms(22), marginTop: hp(12) },
  ready: { flexDirection: 'row', alignItems: 'center', gap: wp(12), padding: ms(12), borderRadius: radius.md, marginTop: hp(12) },
  readyText: { flex: 1, fontSize: fontSize.sm, lineHeight: ms(18) },
});

export default memo(MerchantStampProgress);
