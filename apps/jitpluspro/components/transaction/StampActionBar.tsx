import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react-native';
import { JitGift } from '@/components/icons';
import { brandGradient, palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { ms } from '@/utils/responsive';
import type { StampPlan } from '@/utils/stampTransaction';

interface Props {
  plan: StampPlan;
  currentStamps: number;
  rewardTitle: string | null;
  loading: boolean;
  bottomInset: number;
  onSubmit: () => void;
}

function actionLabelKey(plan: StampPlan): { key: string; count?: number } {
  switch (plan.kind) {
    case 'earn':
      return { key: plan.creditedStamps === 1 ? 'stampScreen.ctaEarn_one' : 'stampScreen.ctaEarn_other', count: plan.creditedStamps };
    case 'earnAndRedeem':
      return { key: plan.creditedStamps === 1 ? 'stampScreen.ctaEarnAndRedeem_one' : 'stampScreen.ctaEarnAndRedeem_other', count: plan.creditedStamps };
    case 'redeem':
      return { key: 'stampScreen.ctaRedeem' };
    default:
      switch (plan.blocker) {
        case 'enterAmount':
          return { key: 'stampScreen.ctaEnterAmount' };
        case 'amountTooLow':
          return { key: 'stampScreen.ctaAmountTooLow' };
        case 'limitReached':
          return { key: 'stampScreen.ctaLimitReached' };
        case 'rewardTooExpensive':
          return { key: 'stampScreen.ctaRewardTooExpensive' };
        default:
          return { key: 'stampScreen.ctaNothing' };
      }
  }
}

function StampActionBarBase({ plan, currentStamps, rewardTitle, loading, bottomInset, onSubmit }: Props) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const row = isRTL ? 'row-reverse' : 'row';
  const enabled = plan.kind !== 'none' && !loading;
  const label = actionLabelKey(plan);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const changes = plan.kind !== 'none' && plan.balanceAfter !== currentStamps;

  const showReward = !!rewardTitle && (plan.kind === 'redeem' || plan.kind === 'earnAndRedeem');
  const labelText = t(label.key, label.count != null ? { count: label.count } : undefined);

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.bgCard,
          borderTopColor: theme.mode === 'dark' ? theme.border : theme.borderLight,
          shadowOpacity: theme.mode === 'dark' ? 0.4 : 0.08,
          paddingBottom: Math.max(bottomInset, 12),
        },
      ]}
    >
      {plan.kind !== 'none' && (
        <View style={[styles.summary, { flexDirection: row }]}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{t('stampScreen.summaryBalance')}</Text>
          <View style={[styles.balance, { flexDirection: row, backgroundColor: theme.bgInput }]}>
            <Text style={[styles.balanceFrom, { color: changes ? theme.textMuted : theme.text }]}>{currentStamps}</Text>
            {changes && (
              <>
                <Arrow size={ms(13)} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
                <Text style={[styles.balanceTo, { color: theme.primary }]}>{plan.balanceAfter}</Text>
              </>
            )}
          </View>
          {showReward && (
            <View style={[styles.reward, { flexDirection: row, backgroundColor: theme.primaryBg }]}>
              <JitGift size={ms(13)} color={theme.primary} strokeWidth={icon.strokeSmall} />
              <Text style={[styles.rewardText, { color: theme.primary }]} numberOfLines={1}>
                {rewardTitle}
              </Text>
            </View>
          )}
        </View>
      )}
      <ActionButton
        label={labelText}
        onPress={onSubmit}
        disabled={!enabled}
        loading={loading}
        variant={enabled || loading ? 'primary' : 'secondary'}
        size="lg"
        icon={enabled ? CheckCircle : undefined}
        gradient={enabled || loading ? brandGradient : undefined}
        style={[styles.button, enabled && styles.buttonShadowOn, !enabled && !loading && { backgroundColor: theme.bgInput, borderColor: theme.bgInput }]}
        labelStyle={enabled || loading ? undefined : { color: theme.textMuted }}
      />
    </View>
  );
}

export const StampActionBar = memo(StampActionBarBase);

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 12,
  },
  summary: { alignItems: 'center', gap: 8 },
  summaryLabel: { fontSize: ms(13), fontFamily: font.medium },
  balance: { alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  balanceFrom: { fontSize: ms(14), fontFamily: font.semibold },
  balanceTo: { fontSize: ms(16), fontFamily: font.bold },
  reward: { flexShrink: 1, alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rewardText: { flexShrink: 1, fontSize: ms(13), fontFamily: font.semibold },
  buttonShadowOn: {
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  button: { minHeight: 56, borderWidth: 0 },
});
