import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthActions } from '@/contexts/AuthContext';
import { useDir } from '@/hooks/useDir';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useCurrency } from '@/hooks/useCurrency';
import { queryKeys, useRewards } from '@/hooks/useQueryHooks';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { hapticSuccess } from '@/utils/haptics';
import { font, icon as iconTokens } from '@/constants/design';
import {
  DEFAULT_AMOUNT_PER_STAMP,
  DEFAULT_STAMPS_FOR_REWARD,
  MAX_CARD_SLOTS,
  MIN_CARD_SLOTS,
  cardSlots,
  rescaleStamps,
} from '@/utils/stamps';
import PremiumLockModal from '@/components/PremiumLockModal';
import { ProBadge } from '@/components/ui/ProBadge';
import LoyaltyCardPreview from '@/components/settings/LoyaltyCardPreview';
import { confirmAsync } from '@/utils/confirm';
import { Segmented, surfaceShadow, type SegmentItem } from '@/components/stores/StoreUi';
import { Note } from '@/components/setup/SetupUi';
import type { StepProps } from '@/components/setup/stepProps';
import type { Reward } from '@/types';

type Mode = 'PER_VISIT' | 'PER_AMOUNT';
const EMPTY_REWARDS: Reward[] = [];
/** Backend ceiling for amountPerStamp (UpdateLoyaltySettingsDto). */
const MAX_AMOUNT_PER_STAMP = 10000;
/** Stamps shown in the worked example of the "per amount" rule. */
const EXAMPLE_STAMPS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The loyalty card rule: how a stamp is earned and how many stamps fill the
 * card. Saved on "Continuer" through the same endpoint as the Fidélité screen.
 */
export function CardStep({ merchant, registerSave }: StepProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const qc = useQueryClient();
  const { updateMerchant } = useAuthActions();
  const { isPremium } = usePlanStatus(merchant);
  const currency = useCurrency();
  const { data: rewards = EMPTY_REWARDS } = useRewards(true);

  const savedMode: Mode = merchant.stampEarningMode || 'PER_VISIT';
  const savedAmount = String(merchant.amountPerStamp ?? DEFAULT_AMOUNT_PER_STAMP);
  const savedSlots = merchant.stampsForReward || DEFAULT_STAMPS_FOR_REWARD;
  const [mode, setMode] = useState<Mode>(savedMode);
  const [amount, setAmount] = useState(savedAmount);
  const [slots, setSlots] = useState(savedSlots);
  const [lockVisible, setLockVisible] = useState(false);

  const locked = !isPremium;
  const guard = (fn: () => void) => () => (locked ? setLockVisible(true) : fn());
  const isPerAmount = mode === 'PER_AMOUNT';
  const parsedAmount = round2(parseFloat(amount.replace(',', '.')));
  const amountValid = parsedAmount > 0 && parsedAmount <= MAX_AMOUNT_PER_STAMP;
  const rate = amountValid ? parsedAmount : DEFAULT_AMOUNT_PER_STAMP;
  const amountLabel = String(rate);
  const ruleText = isPerAmount
    ? t('settingsPage.ruleAmount', { amount: amountLabel, currency: currency.symbol })
    : t('settingsPage.simPerVisit');
  const previewTotal = cardSlots(rewards.map((r) => rescaleStamps(r.cout, savedSlots, slots)), slots);
  const minSlots = Math.min(MIN_CARD_SLOTS, savedSlots);
  const maxSlots = Math.max(MAX_CARD_SLOTS, savedSlots);

  const modes = useMemo<SegmentItem<Mode>[]>(() => [
    { key: 'PER_VISIT', label: t('setup.card.modeVisit') },
    { key: 'PER_AMOUNT', label: t('setup.card.modeAmount') },
  ], [t]);

  const changedSlots = slots !== savedSlots;
  const dirty = !locked && (mode !== savedMode || (isPerAmount && amount !== savedAmount) || changedSlots);

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (isPerAmount && !amountValid) {
      Alert.alert(t('common.error'), t('settingsPage.amountPerStampError'));
      return false;
    }
    const payload: Record<string, unknown> = { stampEarningMode: mode };
    if (isPerAmount) payload.amountPerStamp = parsedAmount;
    if (changedSlots) payload.stampsForReward = slots;
    try {
      if (changedSlots) {
        // Existing balances are rescaled: ask first, like the Fidélité screen.
        const withStamps = await api
          .get('/merchant/loyalty-settings/preview-slots')
          .then((r) => r.data.clientsWithStamps as number)
          .catch(() => 0);
        if (withStamps > 0) {
          const exFrom = Math.max(1, Math.round(savedSlots / 2));
          const exTo = rescaleStamps(exFrom, savedSlots, slots, 0);
          const ok = await confirmAsync(
            t('settingsPage.slotsConfirmTitle'),
            t(withStamps === 1 ? 'settingsPage.slotsConfirmMessage_one' : 'settingsPage.slotsConfirmMessage_other', {
              count: withStamps, from: savedSlots, to: slots, exFrom, exTo,
            }),
            t('common.cancel'),
            t('common.confirm'),
          );
          if (!ok) return false;
        }
      }
      const res = await api.patch('/merchant/loyalty-settings', payload);
      updateMerchant(res.data);
      qc.invalidateQueries({ queryKey: queryKeys.rewards });
      hapticSuccess();
      return true;
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
      return false;
    }
  }, [dirty, mode, isPerAmount, changedSlots, slots, savedSlots, parsedAmount, amountValid, updateMerchant, qc, t]);

  useEffect(() => {
    registerSave(save, dirty);
    return () => registerSave(null);
  }, [save, dirty, registerSave]);

  return (
    <>
      {/* No panel header: the page heading already names the topic, and the whole page must fit one screen. */}
      <View style={[styles.card, { backgroundColor: theme.bgCard }, surfaceShadow(theme)]}>
        {locked ? (
          <TouchableOpacity
            onPress={() => setLockVisible(true)}
            style={[styles.lockRow, { flexDirection: dir.row }]}
            accessibilityRole="button"
            accessibilityLabel={t('settingsPage.proUnlockCta')}
          >
            <ProBadge locked />
            <Text style={[styles.lockText, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
              {t('settingsPage.proLockedHint')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <Segmented items={modes} value={mode} onChange={(m) => guard(() => setMode(m))()} role="radiogroup" />

        {isPerAmount ? (
          <View style={[styles.line, { flexDirection: dir.row }]}>
            <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
              {t('settingsPage.accumulationRate')}
            </Text>
            <View style={[styles.rateWrap, { flexDirection: dir.row, backgroundColor: theme.bgInput }]}>
              <TextInput
                style={[styles.rateInput, { color: theme.text }]}
                value={amount}
                onChangeText={setAmount}
                editable={!locked}
                onPressIn={locked ? () => setLockVisible(true) : undefined}
                keyboardType="decimal-pad"
                placeholder={String(DEFAULT_AMOUNT_PER_STAMP)}
                placeholderTextColor={theme.textMuted}
                maxLength={8}
                maxFontSizeMultiplier={1.2}
                accessibilityLabel={t('settingsPage.accumulationRate')}
              />
              <Text style={[styles.rateSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{currency.symbol}</Text>
            </View>
          </View>
        ) : null}
        <Note>
          {isPerAmount
            ? t('setup.card.amountExample', { total: round2(rate * EXAMPLE_STAMPS), currency: currency.symbol, count: EXAMPLE_STAMPS })
            : t('setup.card.perVisitHelp')}
        </Note>

        <View style={[styles.line, { flexDirection: dir.row }]}>
          <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('settingsPage.cardSlots')}
          </Text>
          <View style={[styles.stepper, { flexDirection: dir.row, backgroundColor: theme.bgInput }]}>
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.bgCard }]}
              onPress={guard(() => setSlots((n) => Math.max(minSlots, n - 1)))}
              disabled={!locked && slots <= minSlots}
              hitSlop={6}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settingsPage.cardSlotsDecrease')}
            >
              <Minus size={18} color={!locked && slots <= minSlots ? theme.textMuted : theme.text} strokeWidth={iconTokens.stroke} />
            </TouchableOpacity>
            <Text
              style={[styles.stepperNumber, { color: theme.text }]}
              maxFontSizeMultiplier={1.2}
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${slots} ${slots === 1 ? t('common.stamp') : t('common.stamps')}`}
            >
              {slots}
            </Text>
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.bgCard }]}
              onPress={guard(() => setSlots((n) => Math.min(maxSlots, n + 1)))}
              disabled={!locked && slots >= maxSlots}
              hitSlop={6}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settingsPage.cardSlotsIncrease')}
            >
              <Plus size={18} color={!locked && slots >= maxSlots ? theme.textMuted : theme.text} strokeWidth={iconTokens.stroke} />
            </TouchableOpacity>
          </View>
        </View>
        <Note>
          {isPerAmount
            ? t('setup.card.summaryAmount', { total: round2(rate * slots), currency: currency.symbol })
            : t('setup.card.summaryVisit', { count: slots })}
        </Note>
      </View>

      {/* Live preview of the card customers will see, under the rule it reflects. */}
      <LoyaltyCardPreview theme={theme} t={t} merchant={merchant} total={previewTotal} ruleText={ruleText} />

      <PremiumLockModal
        visible={lockVisible}
        onClose={() => setLockVisible(false)}
        titleKey="settingsPage.premiumLoyaltyTitle"
        descKey="settingsPage.premiumLoyaltyDesc"
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14 },
  lockRow: { alignItems: 'center', gap: 8, marginBottom: 10 },
  lockText: { flex: 1, fontSize: 12.5, fontFamily: font.regular },
  line: { alignItems: 'center', gap: 12, marginTop: 12, minHeight: 44 },
  label: { flex: 1, fontSize: 13.5, lineHeight: 18, fontFamily: font.semibold },
  rateWrap: { alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, height: 44, width: 132 },
  rateInput: { flex: 1, fontSize: 16, fontFamily: font.semibold, paddingVertical: 0, textAlign: 'center' },
  rateSuffix: { fontSize: 13, fontFamily: font.medium },
  stepper: { alignItems: 'center', borderRadius: 12, padding: 4, width: 132, justifyContent: 'space-between' },
  stepperBtn: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepperNumber: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3 },
});
