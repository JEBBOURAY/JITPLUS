import { memo } from 'react';
import { View, Pressable, Switch, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { ArrowRight, ArrowLeft, CheckCircle, LayoutGrid } from 'lucide-react-native';
import { JitStamp } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { ms } from '@/utils/responsive';
import type { StampPlan } from '@/utils/stampTransaction';

/** "Count this visit" switch, shown in PER_VISIT mode only (PER_AMOUNT counts from the amount). */
export interface VisitToggle {
  on: boolean;
  /** Stamp limit reached: no stamp can be added. */
  disabled: boolean;
  onChange: (value: boolean) => void;
}

interface Props {
  plan: StampPlan;
  currentStamps: number;
  visit: VisitToggle | null;
  /** Collection products picked for this visit */
  collectionCount: number;
  loading: boolean;
  bottomInset: number;
  onSubmit: () => void;
}

function actionLabelKey(plan: StampPlan): { key: string; count?: number } {
  switch (plan.kind) {
    case 'earn':
      if (plan.purchaseOnly) return { key: 'stampScreen.ctaPurchase' };
      return { key: plan.creditedStamps === 1 ? 'stampScreen.ctaEarn_one' : 'stampScreen.ctaEarn_other', count: plan.creditedStamps };
    case 'earnAndRedeem':
      if (plan.purchaseOnly) return { key: 'stampScreen.ctaPurchaseAndRedeem' };
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

function StampActionBarBase({ plan, currentStamps, visit, collectionCount, loading, bottomInset, onSubmit }: Props) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const row = isRTL ? 'row-reverse' : 'row';
  // Collection products alone are enough to validate (no stamp, no gift).
  const collectionOnly = plan.kind === 'none' && collectionCount > 0;
  const enabled = (plan.kind !== 'none' || collectionOnly) && !loading;
  const label: { key: string; count?: number } = collectionOnly
    ? { key: collectionCount === 1 ? 'collection.till.ctaOnly_one' : 'collection.till.ctaOnly_other', count: collectionCount }
    : actionLabelKey(plan);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const changes = plan.kind !== 'none' && plan.balanceAfter !== currentStamps;

  const visitOn = !!visit && visit.on && !visit.disabled;
  const showSummary = !!visit || plan.kind !== 'none' || collectionCount > 0;
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
      {showSummary && (
        <View style={[styles.summary, { flexDirection: row }]}>
          {/* The switch sits next to the button it changes: on = "+1 tampon et offrir", off = "Offrir le cadeau". */}
          {visit && (
            <Pressable
              style={({ pressed }) => [styles.visit, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => visit.onChange(!visit.on)}
              disabled={visit.disabled || loading}
              hitSlop={6}
              accessibilityRole="switch"
              accessibilityState={{ checked: visitOn, disabled: visit.disabled }}
              accessibilityLabel={t('stampScreen.visitTitle')}
            >
              <JitStamp size={ms(18)} color={visitOn ? theme.primary : theme.textMuted} strokeWidth={icon.stroke} />
              <Text style={[styles.visitText, { color: visitOn ? theme.text : theme.textMuted }]} numberOfLines={1}>
                {visitOn ? t('stampScreen.visitOn') : t('stampScreen.visitOff')}
              </Text>
              <Switch
                value={visitOn}
                onValueChange={visit.onChange}
                disabled={visit.disabled || loading}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>
          )}
          <View style={[styles.side, { flexDirection: row, justifyContent: visit ? 'flex-end' : 'flex-start' }]}>
            {collectionCount > 0 && (
              <View style={[styles.chip, { flexDirection: row, backgroundColor: theme.primaryBg }]}>
                <LayoutGrid size={ms(13)} color={theme.primary} strokeWidth={icon.strokeSmall} />
                <Text style={[styles.chipText, { color: theme.primary }]} numberOfLines={1}>
                  {t(collectionCount === 1 ? 'collection.till.chip_one' : 'collection.till.chip_other', { count: collectionCount })}
                </Text>
              </View>
            )}
            {plan.kind !== 'none' && (
              <View
                style={[styles.balance, { flexDirection: row, backgroundColor: theme.bgInput }]}
                accessible
                accessibilityLabel={t('stampScreen.successBalance', { count: plan.balanceAfter })}
              >
                {!visit && <JitStamp size={ms(15)} color={theme.textSecondary} strokeWidth={icon.strokeSmall} />}
                <Text style={[styles.balanceFrom, { color: changes ? theme.textMuted : theme.text }]}>{currentStamps}</Text>
                {changes && (
                  <>
                    <Arrow size={ms(13)} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
                    <Text style={[styles.balanceTo, { color: theme.primary }]}>{plan.balanceAfter}</Text>
                  </>
                )}
              </View>
            )}
          </View>
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
  summary: { alignItems: 'center', gap: 8, minHeight: 44 },
  visit: { alignItems: 'center', gap: 8, flexShrink: 1, minHeight: 44 },
  visitText: { flexShrink: 1, fontSize: ms(15), fontFamily: font.semibold },
  // Wraps instead of overflowing with large text or a long Arabic label.
  side: { flex: 1, flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  balance: { alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  balanceFrom: { fontSize: ms(14), fontFamily: font.semibold },
  balanceTo: { fontSize: ms(16), fontFamily: font.semibold },
  chip: { alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: ms(13), fontFamily: font.semibold },
  buttonShadowOn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  button: { minHeight: 56, borderWidth: 0 },
});
