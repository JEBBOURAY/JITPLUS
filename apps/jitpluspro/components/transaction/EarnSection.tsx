import { memo, useState } from 'react';
import { View, Text, TextInput, Switch, Pressable, StyleSheet } from 'react-native';
import { Stamp, Trophy, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { DEFAULT_CURRENCY } from '@/config/currency';
import { MAX_AMOUNT_DIGITS, MAX_STAMPS_PER_TX } from '@/constants/app';
import type { EarningMode, StampPlan } from '@/utils/stampTransaction';
import { cardSurface, cardStyles, TintNotice } from './ui';

interface Props {
  mode: EarningMode;
  amount: string;
  onAmountChange: (text: string) => void;
  countVisit: boolean;
  onCountVisitChange: (value: boolean) => void;
  plan: StampPlan;
  /** Price of one stamp, already formatted (PER_AMOUNT). */
  amountPerStampLabel: string;
  /** Minimum spend for a lucky-wheel spin, 0 when no wheel needs an amount. */
  wheelMinSpend: number;
  wheelMinSpendLabel: string;
  accumulationLimit?: number | null;
  /** The purchase was already recorded by a coupon redemption. */
  purchaseRecordedByCoupon: boolean;
}

function EarnSectionBase({
  mode,
  amount,
  onAmountChange,
  countVisit,
  onCountVisitChange,
  plan,
  amountPerStampLabel,
  wheelMinSpend,
  wheelMinSpendLabel,
  accumulationLimit,
  purchaseRecordedByCoupon,
}: Props) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const row = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const [focused, setFocused] = useState(false);
  const amountNum = parseFloat(amount) || 0;
  const isPerAmount = mode === 'PER_AMOUNT';
  const visitOn = countVisit && !plan.atLimit;
  const showAmount = isPerAmount || (wheelMinSpend > 0 && visitOn);
  const amountLabel = isPerAmount ? t('stampScreen.amountLabel') : t('stampScreen.wheelAmountLabel');
  const inputBorder = focused ? theme.primary : amountNum > 0 ? `${theme.primary}66` : 'transparent';

  return (
    <View style={[cardStyles.card, cardSurface(theme), styles.card]}>
      {!isPerAmount && (
        <Pressable
          style={({ pressed }) => [
            styles.visitRow,
            {
              flexDirection: row,
              backgroundColor: visitOn ? theme.primaryBg : theme.bgInput,
              borderColor: visitOn ? `${theme.primary}55` : 'transparent',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => onCountVisitChange(!countVisit)}
          disabled={plan.atLimit}
          accessibilityRole="switch"
          accessibilityState={{ checked: visitOn, disabled: plan.atLimit }}
          accessibilityLabel={t('stampScreen.visitTitle')}
        >
          <View style={[styles.visitIcon, { backgroundColor: visitOn ? theme.primary : theme.bgCard }]}>
            <Stamp size={ms(22)} color={visitOn ? '#fff' : theme.textMuted} strokeWidth={1.7} />
          </View>
          <View style={styles.visitText}>
            <Text style={[styles.title, { color: theme.text, textAlign }]}>{t('stampScreen.visitTitle')}</Text>
            <Text style={[styles.subtitle, { color: visitOn ? theme.primary : theme.textMuted, textAlign }]}>
              {visitOn ? t('stampScreen.visitOn') : t('stampScreen.visitOff')}
            </Text>
          </View>
          <Switch
            value={visitOn}
            onValueChange={onCountVisitChange}
            disabled={plan.atLimit}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#fff"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
      )}

      {showAmount && (
        <View style={styles.amountBlock}>
          <Text style={[styles.amountCaption, { color: theme.textSecondary }]}>{amountLabel}</Text>
          <View
            style={[
              styles.inputWrap,
              { backgroundColor: theme.bgInput, borderColor: inputBorder },
              isPerAmount ? styles.inputWrapLarge : styles.inputWrapSmall,
            ]}
          >
            <TextInput
              style={[styles.input, isPerAmount ? styles.inputLarge : styles.inputSmall, { color: theme.text }]}
              value={amount}
              onChangeText={onAmountChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={`${theme.textMuted}88`}
              maxLength={MAX_AMOUNT_DIGITS}
              returnKeyType="done"
              autoFocus={isPerAmount}
              selectTextOnFocus
              selectionColor={theme.primary}
              accessibilityLabel={amountLabel}
            />
            <Text
              style={[
                styles.currency,
                isPerAmount ? styles.currencyLarge : styles.currencySmall,
                isRTL ? styles.currencyRtl : styles.currencyLtr,
                { color: amountNum > 0 ? theme.primary : theme.textMuted },
              ]}
            >
              {DEFAULT_CURRENCY.symbol}
            </Text>
          </View>

          {isPerAmount &&
            (amountNum > 0 && plan.earnStamps > 0 ? (
              <View style={[styles.earnPill, { flexDirection: row, backgroundColor: `${theme.success}1A` }]}>
                <Stamp size={ms(16)} color={theme.success} strokeWidth={2} />
                <Text style={[styles.earnPillText, { color: theme.success }]}>
                  {t('stampScreen.stampsPreview', { count: plan.earnStamps })}
                </Text>
              </View>
            ) : plan.amountTooLow ? (
              <TintNotice
                text={t('stampScreen.amountTooLow', { amount: amountPerStampLabel })}
                color={theme.warning}
                icon={AlertTriangle}
                isRTL={isRTL}
              />
            ) : (
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {t('stampScreen.amountRate', { amount: amountPerStampLabel })}
              </Text>
            ))}
        </View>
      )}

      {plan.perTxCapped && (
        <TintNotice
          text={t('stampScreen.perTxCap', { max: MAX_STAMPS_PER_TX })}
          color={theme.warning}
          icon={AlertTriangle}
          isRTL={isRTL}
        />
      )}
      {plan.atLimit && accumulationLimit != null && (
        <TintNotice
          text={t('stampScreen.limitReached', { limit: accumulationLimit })}
          color={theme.warning}
          icon={AlertTriangle}
          isRTL={isRTL}
        />
      )}
      {plan.limitTrimmed && accumulationLimit != null && (
        <TintNotice
          text={t('stampScreen.limitTrimmed', { limit: accumulationLimit, count: plan.creditedStamps })}
          color={theme.warning}
          icon={AlertTriangle}
          isRTL={isRTL}
        />
      )}
      {wheelMinSpend > 0 && plan.earnStamps > 0 && (
        <TintNotice
          text={
            amountNum >= wheelMinSpend
              ? t('stampScreen.wheelEligible')
              : t('stampScreen.wheelHint', { amount: wheelMinSpendLabel })
          }
          color={amountNum >= wheelMinSpend ? theme.success : theme.primary}
          icon={Trophy}
          isRTL={isRTL}
        />
      )}
      {purchaseRecordedByCoupon && (
        <TintNotice
          text={t('stampScreen.couponRecordedPurchase')}
          color={theme.success}
          icon={CheckCircle2}
          isRTL={isRTL}
        />
      )}
    </View>
  );
}

export const EarnSection = memo(EarnSectionBase);

const styles = StyleSheet.create({
  card: { marginTop: 14, gap: 12 },
  visitRow: { alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 12, minHeight: ms(68) },
  visitIcon: { width: ms(44), height: ms(44), borderRadius: ms(22), alignItems: 'center', justifyContent: 'center' },
  visitText: { flex: 1, gap: 2 },
  title: { fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  subtitle: { fontSize: ms(13), fontFamily: 'Lexend_600SemiBold' },
  amountBlock: { gap: 10, alignItems: 'center' },
  amountCaption: { fontSize: ms(13), fontFamily: 'Lexend_500Medium', textAlign: 'center' },
  inputWrap: { alignSelf: 'stretch', justifyContent: 'center', borderRadius: 18, borderWidth: 2 },
  inputWrapLarge: { minHeight: ms(84) },
  inputWrapSmall: { minHeight: ms(56) },
  input: { fontFamily: 'Lexend_700Bold', textAlign: 'center', paddingHorizontal: ms(56), paddingVertical: 8 },
  inputLarge: { fontSize: ms(42), letterSpacing: -0.5 },
  inputSmall: { fontSize: ms(22) },
  currency: { position: 'absolute', fontFamily: 'Lexend_600SemiBold' },
  currencyLarge: { fontSize: ms(18) },
  currencySmall: { fontSize: ms(15) },
  currencyLtr: { right: 18 },
  currencyRtl: { left: 18 },
  earnPill: { alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  earnPillText: { fontSize: ms(15), fontFamily: 'Lexend_700Bold' },
  hint: { fontSize: ms(12.5), fontFamily: 'Lexend_400Regular', textAlign: 'center' },
});
