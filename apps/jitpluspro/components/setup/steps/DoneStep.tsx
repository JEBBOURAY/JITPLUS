import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AlignLeft, Camera, ImagePlus, ListChecks, Share2 } from 'lucide-react-native';
import { JitGift, JitStamp } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useRewards } from '@/hooks/useQueryHooks';
import { font } from '@/constants/design';
import { DEFAULT_AMOUNT_PER_STAMP, DEFAULT_STAMPS_FOR_REWARD, cardSlots } from '@/utils/stamps';
import { Panel } from '@/components/stores/StoreUi';
import { StatusRow } from '@/components/setup/SetupUi';
import { SETUP_ITEMS, SETUP_ITEM_STEP, computeSetupStatus, countSetupDone, type SetupItemId } from '@/components/setup/setupStatus';
import type { SetupStepId } from '@/components/setup/setupSteps';
import type { LucideIcon } from '@/components/home/PromoSheet';
import type { Merchant } from '@/types';

const ITEM_ICONS: Record<SetupItemId, LucideIcon> = {
  logo: Camera,
  cover: ImagePlus,
  reward: JitGift,
  about: AlignLeft,
  social: Share2,
  gallery: ImagePlus,
};

/** Recap of what is set and what is still empty, each line jumping back to its page. */
export function DoneStep({ merchant, goTo }: { merchant: Merchant; goTo: (step: SetupStepId) => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const currency = useCurrency();
  const { data: rewards } = useRewards(true);
  const status = useMemo(() => computeSetupStatus(merchant, rewards), [merchant, rewards]);
  // The loyalty card always has a rule, so its line counts as done.
  const counted = countSetupDone(status);
  const done = counted.done + 1;
  const total = counted.total + 1;

  // Same size as the card customers see: the cheapest gift, else the card rule.
  const slots = cardSlots((rewards ?? []).map((r) => r.cout), merchant.stampsForReward || DEFAULT_STAMPS_FOR_REWARD);
  const rule = merchant.stampEarningMode === 'PER_AMOUNT'
    ? t('settingsPage.ruleAmount', { amount: String(merchant.amountPerStamp ?? DEFAULT_AMOUNT_PER_STAMP), currency: currency.symbol })
    : t('settingsPage.simPerVisit');

  return (
    <Panel
      Icon={ListChecks}
      title={t('setup.done.recapTitle')}
      right={(
        <Text style={[styles.count, { color: done === total ? theme.success : theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
          {done}/{total}
        </Text>
      )}
    >
      <StatusRow
        Icon={JitStamp}
        title={t('setup.step.card.label')}
        summary={t('setup.done.cardSummary', { rule, count: slots })}
        done
        onPress={() => goTo('card')}
      />
      {SETUP_ITEMS.map((id, i) => (
        <StatusRow
          key={id}
          Icon={ITEM_ICONS[id]}
          title={t(`setup.done.${id}Title`)}
          summary={status[id] ? t('setup.done.itemDone') : t('setup.done.itemTodo')}
          done={status[id]}
          onPress={() => goTo(SETUP_ITEM_STEP[id])}
          last={i === SETUP_ITEMS.length - 1}
        />
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 13, fontFamily: font.semibold },
});
