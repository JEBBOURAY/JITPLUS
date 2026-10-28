import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { prizeColor } from '@jitplus/shared/src/luckyWheel';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Chip, ChipRow, FieldLabel, Input, MoreOptions } from '@/components/scratch/ScratchUI';
import { digitsOnly } from '@/components/games/gameForm';
import {
  CLAIM_PRESETS,
  FREQUENCIES,
  FREQUENCY_ORDER,
  STOCK_PRESETS,
  WHEEL_LIMITS,
  frequencyOf,
  type WheelPrizeForm,
} from './wheelForm';
import { WHEEL_TONE } from './colors';

interface Props {
  index: number;
  prize: WheelPrizeForm;
  /** Share of all spins that win this prize, in % */
  chance: number;
  canRemove: boolean;
  /** Stable callbacks (receive the prize key) so React.memo can skip renders */
  onChange: (key: string, patch: Partial<WheelPrizeForm>) => void;
  onRemove: (key: string) => void;
}

export function claimLabel(hours: string, t: (key: string, params?: Record<string, unknown>) => string): string {
  if (!hours.trim()) return t('luckyWheel.prize.claimNone');
  if ((CLAIM_PRESETS as readonly string[]).includes(hours)) return t(`luckyWheel.prize.claim${hours}`);
  return t('luckyWheel.prize.claimHours', { hours });
}

export const PrizeEditor = React.memo(function PrizeEditor({ index, prize, chance, canRemove, onChange: onChangeKey, onRemove }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const [showOptions, setShowOptions] = useState(false);
  const onChange = (patch: Partial<WheelPrizeForm>) => onChangeKey(prize.key, patch);
  const frequency = frequencyOf(prize.weight);
  const customClaim = !!prize.claimWindowHours && !(CLAIM_PRESETS as readonly string[]).includes(prize.claimWindowHours);

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      <View style={[styles.headerRow, { flexDirection: row }]}>
        <View style={[styles.swatch, { backgroundColor: prizeColor(index) }]} />
        <Text style={[styles.title, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
          {t('luckyWheel.prize.title', { n: index + 1 })}
        </Text>
        <Text style={[styles.chance, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
          {t('luckyWheel.prize.chance', { pct: chance })}
        </Text>
        {canRemove && (
          <TouchableOpacity
            onPress={() => onRemove(prize.key)}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={t('luckyWheel.prize.remove', { n: index + 1 })}
          >
            <Trash2 size={18} color={WHEEL_TONE.danger} strokeWidth={icon.stroke} />
          </TouchableOpacity>
        )}
      </View>

      <FieldLabel text={t('luckyWheel.prize.name')} />
      <Input
        value={prize.label}
        onChangeText={(label) => onChange({ label })}
        placeholder={t('luckyWheel.prize.namePlaceholder')}
        maxLength={WHEEL_LIMITS.LABEL_MAX}
        accessibilityLabel={t('luckyWheel.prize.name')}
      />

      <FieldLabel text={t('luckyWheel.prize.frequency')} hint={t('luckyWheel.prize.frequencyHint')} />
      <ChipRow>
        {FREQUENCY_ORDER.map((f) => (
          <Chip
            key={f}
            label={t(`luckyWheel.prize.frequency_${f}`)}
            selected={frequency === f}
            onPress={() => onChange({ weight: String(FREQUENCIES[f]) })}
          />
        ))}
        {frequency == null && (
          <Chip label={t('luckyWheel.prize.frequencyCustom', { weight: prize.weight })} selected onPress={() => {}} />
        )}
      </ChipRow>

      <FieldLabel text={t('luckyWheel.prize.stock')} hint={t('luckyWheel.prize.stockHint')} />
      <View style={[styles.stockRow, { flexDirection: row }]}>
        <ChipRow>
          {STOCK_PRESETS.map((n) => (
            <Chip key={n} label={String(n)} selected={prize.totalStock === String(n)} onPress={() => onChange({ totalStock: String(n) })} />
          ))}
        </ChipRow>
        <Input
          value={prize.totalStock}
          onChangeText={(v) => onChange({ totalStock: digitsOnly(v) })}
          keyboardType="number-pad"
          maxLength={5}
          placeholder="50"
          style={styles.stockInput}
          accessibilityLabel={t('luckyWheel.prize.stock')}
        />
      </View>

      <MoreOptions
        open={showOptions}
        onToggle={() => setShowOptions((v) => !v)}
        label={t('luckyWheel.prize.moreOptions', { claim: claimLabel(prize.claimWindowHours, t) })}
      >
        <FieldLabel text={t('luckyWheel.prize.claim')} hint={t('luckyWheel.prize.claimHint')} />
        <ChipRow>
          {CLAIM_PRESETS.map((h) => (
            <Chip key={h || 'none'} label={claimLabel(h, t)} selected={prize.claimWindowHours === h} onPress={() => onChange({ claimWindowHours: h })} />
          ))}
          {customClaim && <Chip label={claimLabel(prize.claimWindowHours, t)} selected onPress={() => {}} />}
        </ChipRow>
        <FieldLabel text={t('luckyWheel.prize.description')} hint={t('luckyWheel.prize.descriptionHint')} />
        <Input
          value={prize.description}
          onChangeText={(description) => onChange({ description })}
          placeholder={t('luckyWheel.prize.descriptionPlaceholder')}
          maxLength={WHEEL_LIMITS.PRIZE_DESCRIPTION_MAX}
          accessibilityLabel={t('luckyWheel.prize.description')}
        />
      </MoreOptions>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  headerRow: { alignItems: 'center', gap: 8, minHeight: 32 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  title: { flex: 1, fontSize: ms(15), fontFamily: font.semibold },
  chance: { fontSize: ms(13), fontFamily: font.semibold },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stockRow: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stockInput: { minWidth: 84, textAlign: 'center' },
});
