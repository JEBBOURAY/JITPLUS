import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Minus, Plus } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { JitGift } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { queryKeys, useRewards } from '@/hooks/useQueryHooks';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { hapticSuccess } from '@/utils/haptics';
import { font, icon as iconTokens } from '@/constants/design';
import { DEFAULT_STAMPS_FOR_REWARD, MAX_CARD_SLOTS } from '@/utils/stamps';
import { Panel, TextField } from '@/components/stores/StoreUi';
import { Chip, Note } from '@/components/setup/SetupUi';
import type { StepProps } from '@/components/setup/stepProps';
import type { Reward } from '@/types';

const EMPTY_REWARDS: Reward[] = [];
const TITLE_MAX = 60;
/** Rewards a free account may hold (mirrors RewardManager and the backend plan limit). */
const FREE_PLAN_REWARDS = 1;

/**
 * The first gift: what a full card earns. Suggestions fill the form in one
 * tap; "Continuer" is the only action: it adds the gift being typed, and
 * refuses to go on with no gift at all (the merchant can still skip from the
 * header). A free account that already holds its gift only sees the list.
 */
export function RewardStep({ merchant, registerSave }: StepProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const qc = useQueryClient();
  const { isPremium } = usePlanStatus(merchant);
  const { data: rewards = EMPTY_REWARDS, isLoading } = useRewards(true);

  const slots = merchant.stampsForReward || DEFAULT_STAMPS_FOR_REWARD;
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState(slots);

  const suggestions = useMemo(() => [
    { title: t('settingsPage.suggestCoffee'), cost: slots },
    { title: t('settingsPage.suggestDiscount'), cost: Math.max(1, Math.round(slots / 2)) },
    { title: t('settingsPage.suggestFreeItem'), cost: slots },
  ], [t, slots]);

  const unit = (n: number) => (n === 1 ? t('common.stamp') : t('common.stamps'));
  const atFreeLimit = !isPremium && rewards.length >= FREE_PLAN_REWARDS;

  const save = useCallback(async (): Promise<boolean> => {
    const titre = title.trim();
    if (!titre) {
      if (rewards.length > 0) return true;
      Alert.alert(t('setup.reward.needOneTitle'), t('setup.reward.needOneMsg'));
      return false;
    }
    try {
      await api.post('/rewards', { titre, cout: cost });
      await qc.invalidateQueries({ queryKey: queryKeys.rewards });
      setTitle('');
      setCost(slots);
      hapticSuccess();
      return true;
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
      return false;
    }
  }, [title, rewards.length, cost, slots, qc, t]);

  const dirty = title.trim().length > 0;
  useEffect(() => {
    registerSave(save, dirty);
    return () => registerSave(null);
  }, [save, dirty, registerSave]);

  // The customer's card follows the cheapest gift: say what this cost does to it.
  const cardAfter = Math.min(cost, ...rewards.map((r) => r.cout));
  const costNote = cost > cardAfter
    ? t('setup.reward.costAbove', { count: cost, total: cardAfter })
    : cost === slots
      ? t('setup.reward.costFullCard', { count: slots })
      : t('setup.reward.costSetsCard', { count: cost });

  return (
    <>
      {rewards.length > 0 || isLoading ? (
        <Panel Icon={Check} title={t('setup.reward.listTitle')}>
          {isLoading ? <ActivityIndicator color={theme.primary} /> : rewards.map((r, i) => (
            <View
              key={r.id}
              style={[styles.rewardRow, { flexDirection: dir.row }, i < rewards.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderLight }]}
            >
              <View style={[styles.rewardIcon, { backgroundColor: `${theme.success}1F` }]}>
                <Check size={14} color={theme.success} strokeWidth={iconTokens.strokeSmall} />
              </View>
              <Text style={[styles.rewardTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{r.titre}</Text>
              <Text style={[styles.rewardCost, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{r.cout} {unit(r.cout)}</Text>
            </View>
          ))}
          {atFreeLimit ? <Note>{t('settingsPage.premiumRewardDesc')}</Note> : null}
        </Panel>
      ) : null}

      {atFreeLimit ? null : (
        <Panel
          Icon={JitGift}
          title={rewards.length > 0 ? t('setup.reward.addAnotherTitle') : t('setup.reward.formTitle')}
        >
          <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('setup.reward.suggestions')}
          </Text>
          <View style={[styles.chips, { flexDirection: dir.row }]}>
            {suggestions.map((s) => (
              <Chip
                key={s.title}
                label={s.title}
                selected={title === s.title}
                onPress={() => { setTitle(s.title); setCost(s.cost); }}
              />
            ))}
          </View>

          <View style={styles.field}>
            <TextField
              label={t('settingsPage.giftName')}
              value={title}
              onChangeText={setTitle}
              maxLength={TITLE_MAX}
              placeholder={t('setup.reward.placeholder')}
              autoCapitalize="sentences"
              returnKeyType="done"
            />
          </View>

          <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('setup.reward.costLabel')}
          </Text>
          <View style={[styles.stepper, { flexDirection: dir.row, backgroundColor: theme.bgInput }]}>
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.bgCard }]}
              onPress={() => setCost((c) => Math.max(1, c - 1))}
              disabled={cost <= 1}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('setup.reward.costDecrease')}
            >
              <Minus size={18} color={cost <= 1 ? theme.textMuted : theme.text} strokeWidth={iconTokens.stroke} />
            </TouchableOpacity>
            <View style={styles.stepperValue} accessibilityLiveRegion="polite">
              <Text style={[styles.stepperNumber, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{cost}</Text>
              <Text style={[styles.caption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{unit(cost)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.bgCard }]}
              onPress={() => setCost((c) => Math.min(MAX_CARD_SLOTS, c + 1))}
              disabled={cost >= MAX_CARD_SLOTS}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('setup.reward.costIncrease')}
            >
              <Plus size={18} color={cost >= MAX_CARD_SLOTS ? theme.textMuted : theme.text} strokeWidth={iconTokens.stroke} />
            </TouchableOpacity>
          </View>
          <Note>{costNote}</Note>
        </Panel>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13.5, fontFamily: font.semibold, marginBottom: 8 },
  caption: { fontSize: 12, fontFamily: font.regular },
  chips: { flexWrap: 'wrap', gap: 8 },
  field: { marginTop: 16 },
  rewardRow: { alignItems: 'center', gap: 10, paddingVertical: 10 },
  rewardIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rewardTitle: { flex: 1, fontSize: 14, fontFamily: font.semibold },
  rewardCost: { fontSize: 12.5, fontFamily: font.medium },
  stepper: { alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 6 },
  stepperBtn: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { alignItems: 'center' },
  stepperNumber: { fontSize: 22, fontFamily: font.semibold, letterSpacing: -0.5 },
});
