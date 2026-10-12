import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { COUPON_REWARD_TYPES, SCRATCH_LIMITS, type CouponRewardType } from '@jitplus/shared/src/scratch';
import type { Reward } from '@/types';
import { Chip, ChipRow, FieldLabel, Input } from './ScratchUI';
import { countRewardOptions, type DelayHours, type RewardForm } from './campaignForm';

interface Props {
  index: number;
  reward: RewardForm;
  /** Chance shown on the guaranteed reward (the remainder up to 100 %) */
  assuredChance: number;
  canRemove: boolean;
  catalog: Reward[];
  /** Stable callbacks (receive the reward key) so React.memo can skip renders */
  onChange: (key: string, patch: Partial<RewardForm>) => void;
  onRemove: (key: string) => void;
}

const DELAYS: { hours: DelayHours; key: string }[] = [
  { hours: 0, key: 'scratch.wizard.delayNone' },
  { hours: 24, key: 'scratch.wizard.delay24' },
  { hours: 48, key: 'scratch.wizard.delay48' },
];

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');
const decimal = (s: string) => {
  const cleaned = s.replace(',', '.').replace(/[^0-9.]/g, '');
  const [int, ...rest] = cleaned.split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
};

export const RewardEditor = React.memo(function RewardEditor({
  index, reward, assuredChance, canRemove, catalog, onChange: onChangeKey, onRemove,
}: Props) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const isAssured = index === 0;
  const optionCount = countRewardOptions(reward);
  const [showOptions, setShowOptions] = useState(optionCount > 0);
  const row = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const onChange = (patch: Partial<RewardForm>) => onChangeKey(reward.key, patch);
  const isProduct = reward.type === 'FREE_PRODUCT';

  const setType = (type: CouponRewardType) => {
    if (type === reward.type) return;
    const patch: Partial<RewardForm> = { type, rewardId: null };
    // The value and the text mean something else for a product.
    if (type === 'FREE_PRODUCT' || isProduct) {
      patch.value = '';
      patch.label = '';
    }
    if (type !== 'PERCENT_DISCOUNT') patch.maxDiscount = '';
    onChange(patch);
  };

  const valueLabel =
    reward.type === 'PERCENT_DISCOUNT'
      ? t('scratch.wizard.valuePercent')
      : reward.type === 'FIXED_DISCOUNT'
        ? t('scratch.wizard.valueFixed')
        : t('scratch.wizard.valueStamps');

  const toggleDay = (day: number) => {
    const has = reward.weekdays.includes(day);
    onChange({ weekdays: has ? reward.weekdays.filter((d) => d !== day) : [...reward.weekdays, day].sort((a, b) => a - b) });
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.bgElevated, borderColor: isAssured ? theme.primary : theme.borderLight }]}>
      <View style={[styles.headerRow, { flexDirection: row }]}>
        {isAssured && <ShieldCheck size={18} color={theme.primary} />}
        <Text style={[styles.title, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
          {isAssured ? t('scratch.wizard.assuredTitle') : t('scratch.wizard.rewardN', { n: index + 1 })}
        </Text>
        {canRemove && !isAssured && (
          <TouchableOpacity onPress={() => onRemove(reward.key)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('scratch.wizard.removeReward')}>
            <Trash2 size={18} color={theme.danger} />
          </TouchableOpacity>
        )}
      </View>
      {isAssured && (
        <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
          {t('scratch.wizard.assuredHint')}
        </Text>
      )}

      <ChipRow>
        {COUPON_REWARD_TYPES.map((type) => (
          <Chip key={type} label={t(`scratch.rewardType.${type}`)} selected={reward.type === type} onPress={() => setType(type)} />
        ))}
      </ChipRow>

      <View style={[styles.twoCols, { flexDirection: row }]}>
        <View style={styles.colWide}>
          {isProduct ? (
            <>
              <FieldLabel text={t('scratch.wizard.product')} />
              <Input
                value={reward.label}
                onChangeText={(v) => onChange({ label: v, rewardId: null })}
                placeholder={t('scratch.wizard.labelPlaceholderFree')}
                maxLength={SCRATCH_LIMITS.LABEL_MAX}
                accessibilityLabel={t('scratch.wizard.product')}
              />
            </>
          ) : (
            <>
              <FieldLabel text={valueLabel} />
              <Input
                value={reward.value}
                onChangeText={(v) => onChange({ value: reward.type === 'BONUS_STAMPS' ? digitsOnly(v) : decimal(v) })}
                keyboardType={reward.type === 'BONUS_STAMPS' ? 'number-pad' : 'decimal-pad'}
                placeholder={reward.type === 'PERCENT_DISCOUNT' ? '20' : reward.type === 'FIXED_DISCOUNT' ? '30' : '2'}
                maxLength={7}
                accessibilityLabel={valueLabel}
              />
            </>
          )}
        </View>
        <View style={styles.col}>
          <FieldLabel text={t('scratch.wizard.chanceInput')} />
          {isAssured ? (
            <View style={[styles.assuredChance, { backgroundColor: theme.primaryBg }]}>
              <Text
                style={[styles.assuredChanceText, { color: assuredChance >= 1 ? theme.primary : theme.danger }]}
                maxFontSizeMultiplier={1.3}
                accessibilityLabel={t('scratch.wizard.chanceRest', { percent: assuredChance })}
              >
                {Math.max(0, assuredChance)} %
              </Text>
            </View>
          ) : (
            <Input
              value={reward.weight}
              onChangeText={(v) => onChange({ weight: digitsOnly(v).slice(0, 2) })}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="10"
              accessibilityLabel={t('scratch.wizard.chanceInput')}
            />
          )}
        </View>
      </View>

      {isProduct && catalog.length > 0 && (
        <>
          <FieldLabel text={t('scratch.wizard.linkCatalog')} />
          <ChipRow>
            {catalog.map((r) => (
              <Chip
                key={r.id}
                label={r.titre}
                selected={reward.rewardId === r.id}
                onPress={() => onChange({ rewardId: r.id, label: r.titre.slice(0, SCRATCH_LIMITS.LABEL_MAX) })}
              />
            ))}
          </ChipRow>
        </>
      )}

      <TouchableOpacity
        onPress={() => setShowOptions((v) => !v)}
        style={[styles.optionsToggle, { borderColor: theme.borderLight, flexDirection: row }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: showOptions }}
      >
        <Text style={[styles.optionsTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
          {optionCount > 0 ? t('scratch.wizard.moreOptionsCount', { count: optionCount }) : t('scratch.wizard.moreOptions')}
        </Text>
        {showOptions ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
      </TouchableOpacity>

      {showOptions && (
        <View style={styles.options}>
          {!isProduct && (
            <>
              <FieldLabel text={t('scratch.wizard.detail')} />
              <Input
                value={reward.label}
                onChangeText={(v) => onChange({ label: v })}
                placeholder={t('scratch.wizard.detailPlaceholder')}
                maxLength={SCRATCH_LIMITS.LABEL_MAX}
                accessibilityLabel={t('scratch.wizard.detail')}
              />
            </>
          )}

          {reward.type === 'PERCENT_DISCOUNT' && (
            <>
              <FieldLabel text={t('scratch.wizard.maxDiscount')} />
              <Input
                value={reward.maxDiscount}
                onChangeText={(v) => onChange({ maxDiscount: decimal(v) })}
                keyboardType="decimal-pad"
                placeholder="50"
                maxLength={7}
                accessibilityLabel={t('scratch.wizard.maxDiscount')}
              />
            </>
          )}

          {!isAssured && (
            <>
              <FieldLabel text={t('scratch.wizard.stock')} />
              <ChipRow>
                <Chip label={t('scratch.wizard.unlimited')} selected={reward.unlimited} onPress={() => onChange({ unlimited: true })} />
                <Chip label={t('scratch.wizard.limited')} selected={!reward.unlimited} onPress={() => onChange({ unlimited: false })} />
              </ChipRow>
              {!reward.unlimited && (
                <Input
                  value={reward.totalStock}
                  onChangeText={(v) => onChange({ totalStock: digitsOnly(v) })}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="50"
                  accessibilityLabel={t('scratch.wizard.stockCount')}
                />
              )}
            </>
          )}

          <FieldLabel text={t('scratch.wizard.minPurchase')} />
          <Input
            value={reward.minPurchase}
            onChangeText={(v) => onChange({ minPurchase: decimal(v) })}
            keyboardType="decimal-pad"
            maxLength={7}
            placeholder="100"
            accessibilityLabel={t('scratch.wizard.minPurchase')}
          />

          <FieldLabel text={t('scratch.wizard.minDelay')} />
          <ChipRow>
            {DELAYS.map((d) => (
              <Chip key={d.hours} label={t(d.key)} selected={reward.minDelayHours === d.hours} onPress={() => onChange({ minDelayHours: d.hours })} />
            ))}
          </ChipRow>

          <FieldLabel text={t('scratch.wizard.weekdays')} />
          <ChipRow>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <Chip
                key={day}
                label={t(`scratch.weekdayShort.${day}`)}
                selected={reward.weekdays.includes(day)}
                onPress={() => toggleDay(day)}
              />
            ))}
          </ChipRow>

          <FieldLabel text={t('scratch.wizard.hours')} />
          <ChipRow>
            <Chip label={t('scratch.wizard.hoursAll')} selected={!reward.hoursEnabled} onPress={() => onChange({ hoursEnabled: false })} />
            <Chip label={t('scratch.wizard.hoursCustom')} selected={reward.hoursEnabled} onPress={() => onChange({ hoursEnabled: true })} />
          </ChipRow>
          {reward.hoursEnabled && (
            <View style={[styles.twoCols, { flexDirection: row }]}>
              <View style={styles.col}>
                <FieldLabel text={t('scratch.wizard.hoursFrom')} />
                <Input
                  value={reward.fromTime}
                  onChangeText={(v) => onChange({ fromTime: v.replace(/[^0-9:]/g, '').slice(0, 5) })}
                  keyboardType="numbers-and-punctuation"
                  placeholder="10:00"
                  accessibilityLabel={t('scratch.wizard.hoursFrom')}
                />
              </View>
              <View style={styles.col}>
                <FieldLabel text={t('scratch.wizard.hoursTo')} />
                <Input
                  value={reward.toTime}
                  onChangeText={(v) => onChange({ toTime: v.replace(/[^0-9:]/g, '').slice(0, 5) })}
                  keyboardType="numbers-and-punctuation"
                  placeholder="18:00"
                  accessibilityLabel={t('scratch.wizard.hoursTo')}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  headerRow: { alignItems: 'center', gap: 8, minHeight: 32 },
  title: { flex: 1, fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  hint: { fontSize: ms(12), fontFamily: 'Lexend_400Regular', lineHeight: ms(18), marginTop: -4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  twoCols: { gap: 12 },
  col: { flex: 1, gap: 8 },
  colWide: { flex: 2, gap: 8 },
  assuredChance: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  assuredChanceText: { fontSize: ms(16), fontFamily: 'Lexend_600SemiBold' },
  optionsToggle: { alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, minHeight: 44 },
  optionsTitle: { flex: 1, fontSize: ms(13.5), fontFamily: 'Lexend_500Medium' },
  options: { gap: 10 },
});
