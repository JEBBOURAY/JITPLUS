import { memo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, ArrowLeft, CheckCircle, Gift } from 'lucide-react-native';
import { brandGradient, palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
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

export function actionLabelKey(plan: StampPlan): { key: string; count?: number } {
  switch (plan.kind) {
    case 'earn':
      return { key: 'stampScreen.ctaEarn', count: plan.creditedStamps };
    case 'earnAndRedeem':
      return { key: 'stampScreen.ctaEarnAndRedeem', count: plan.creditedStamps };
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

  const content = loading ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <>
      {enabled && <CheckCircle size={ms(19)} color="#fff" strokeWidth={2} />}
      <Text
        style={[styles.buttonText, { color: enabled ? '#fff' : theme.textMuted }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {labelText}
      </Text>
    </>
  );

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
                <Arrow size={ms(13)} color={theme.textMuted} strokeWidth={2.2} />
                <Text style={[styles.balanceTo, { color: theme.primary }]}>{plan.balanceAfter}</Text>
              </>
            )}
          </View>
          {showReward && (
            <View style={[styles.reward, { flexDirection: row, backgroundColor: theme.primaryBg }]}>
              <Gift size={ms(13)} color={theme.primary} strokeWidth={2} />
              <Text style={[styles.rewardText, { color: theme.primary }]} numberOfLines={1}>
                {rewardTitle}
              </Text>
            </View>
          )}
        </View>
      )}
      <TouchableOpacity
        style={[styles.buttonShadow, enabled && styles.buttonShadowOn]}
        onPress={onSubmit}
        disabled={!enabled}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={labelText}
        accessibilityState={{ disabled: !enabled, busy: loading }}
      >
        {enabled || loading ? (
          <LinearGradient
            colors={[...brandGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { flexDirection: row }]}
          >
            {content}
          </LinearGradient>
        ) : (
          <View style={[styles.button, { flexDirection: row, backgroundColor: theme.bgInput }]}>{content}</View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export const StampActionBar = memo(StampActionBarBase);

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 12,
  },
  summary: { alignItems: 'center', gap: 8 },
  summaryLabel: { fontSize: ms(13), fontFamily: 'Lexend_500Medium' },
  balance: { alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  balanceFrom: { fontSize: ms(14), fontFamily: 'Lexend_600SemiBold' },
  balanceTo: { fontSize: ms(16), fontFamily: 'Lexend_700Bold' },
  reward: { flexShrink: 1, alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rewardText: { flexShrink: 1, fontSize: ms(12.5), fontFamily: 'Lexend_600SemiBold' },
  buttonShadow: { borderRadius: 16 },
  buttonShadowOn: {
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  button: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: ms(16), fontFamily: 'Lexend_700Bold', flexShrink: 1 },
});
