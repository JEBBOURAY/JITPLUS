import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { useRewards, useLuckyWheelActiveInfo } from '@/hooks/useQueryHooks';
import { DEFAULT_CURRENCY } from '@/config/currency';
import { DEFAULT_AMOUNT_PER_STAMP, DEFAULT_STAMPS_FOR_REWARD, cardSlots } from '@/utils/stamps';

export interface PlvRewardLine {
  title: string;
  cost: number;
  /** "12 tampons · Menu offert" */
  label: string;
}

/** The merchant's loyalty programme, already phrased for printing on a poster. */
export interface PlvProgram {
  /** Slots on the customer card (cheapest reward, else stampsForReward). */
  slots: number;
  /** "1 tampon à chaque visite" / "1 tampon tous les 20 DH d'achat" */
  earnLine: string;
  /** "8 tampons = Café offert" */
  rewardHeadline: string;
  /** "Café offert dès 8 tampons" */
  rewardShort: string;
  /** Rewards other than the main one, cheapest first (max 2). */
  otherRewards: PlvRewardLine[];
  /** Null when no lucky-wheel campaign is running. */
  wheelLine: string | null;
  /** Null when stamps never expire. */
  validityLine: string | null;
}

function formatAmount(value: number): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(DEFAULT_CURRENCY.decimals);
  return `${n} ${DEFAULT_CURRENCY.symbol}`;
}

/**
 * Builds the poster copy from the merchant's real settings (earning mode,
 * rewards, lucky wheel, stamp validity) so every PLV matches what the
 * customer will actually get at this store.
 */
export function usePlvProgram(): PlvProgram {
  const { t } = useLanguage();
  const merchant = useAuthStore((s) => s.merchant);
  const { data: rewards } = useRewards(!!merchant);
  const { data: wheelInfo } = useLuckyWheelActiveInfo();

  return useMemo(() => {
    const unit = (n: number) => (n === 1 ? t('common.stamp') : t('common.stamps'));

    const sorted = [...(rewards ?? [])]
      .filter((r) => r && r.titre && r.cout > 0)
      .sort((a, b) => a.cout - b.cout);
    const stampsForReward = merchant?.stampsForReward || DEFAULT_STAMPS_FOR_REWARD;
    const slots = cardSlots(sorted.map((r) => r.cout), stampsForReward);

    const main = sorted[0]
      ? { title: sorted[0].titre.trim(), cost: sorted[0].cout }
      : { title: t('home.clientPlvDefaultReward'), cost: stampsForReward };

    const earnLine = merchant?.stampEarningMode === 'PER_AMOUNT'
      ? t('home.clientPlvEarnAmount', { amount: formatAmount(merchant.amountPerStamp || DEFAULT_AMOUNT_PER_STAMP) })
      : t('home.clientPlvEarnVisit');

    const otherRewards = sorted.slice(1, 3).map((r) => ({
      title: r.titre.trim(),
      cost: r.cout,
      label: t('home.clientPlvRewardItem', { count: r.cout, unit: unit(r.cout), reward: r.titre.trim() }),
    }));

    let wheelLine: string | null = null;
    if (wheelInfo?.hasActiveLuckyWheel) {
      wheelLine = wheelInfo.minSpendAmount > 0
        ? t('home.clientPlvWheelMin', { amount: formatAmount(wheelInfo.minSpendAmount) })
        : t('home.clientPlvWheelAlways');
    }

    const validityLine = merchant?.stampValidityDays
      ? t('home.clientPlvValidity', { days: merchant.stampValidityDays })
      : null;

    return {
      slots,
      earnLine,
      rewardHeadline: t('home.clientPlvRewardHeadline', { count: main.cost, unit: unit(main.cost), reward: main.title }),
      rewardShort: t('home.clientPlvRewardShort', { count: main.cost, unit: unit(main.cost), reward: main.title }),
      otherRewards,
      wheelLine,
      validityLine,
    };
  }, [t, merchant, rewards, wheelInfo]);
}
