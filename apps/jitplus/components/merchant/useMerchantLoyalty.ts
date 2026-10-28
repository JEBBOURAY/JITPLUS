import { useMemo } from 'react';
import { getFicheRewards } from '@jitplus/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDate } from '@/utils/date';
import type { Merchant, MerchantReward } from '@/types';

export interface MerchantLoyalty {
  /** Sorted by cost, never empty. */
  rewards: MerchantReward[];
  isMember: boolean;
  balance: number;
  /** Cheapest reward the balance does not cover yet; null once all of them are reachable. */
  nextReward: MerchantReward | null;
  hasReadyReward: boolean;
  /** Stamps needed for the next reward, or for the dearest one when all are reachable. */
  goal: number;
  earned: number;
  earnLine: string;
  validityLine: string | null;
}

/** Loyalty state of the page, computed once for the overview, the loyalty tab and the bottom bar. */
export function useMerchantLoyalty(merchant: Merchant | undefined): MerchantLoyalty | null {
  const { t, locale } = useLanguage();
  return useMemo(() => {
    if (!merchant) return null;
    const rewards = getFicheRewards(merchant.rewards, merchant.stampsForReward, t('merchant.defaultReward'));
    const isMember = !!merchant.hasCard;
    const balance = isMember ? Math.max(0, merchant.cardBalance ?? 0) : 0;
    const nextReward = rewards.find((r) => r.cout > balance) ?? null;
    const goal = nextReward?.cout ?? rewards[rewards.length - 1].cout;
    const earnLine = merchant.stampEarningMode === 'PER_AMOUNT' && merchant.amountPerStamp
      ? t('merchant.earnPerAmount', { amount: merchant.amountPerStamp })
      : t('merchant.earnPerVisit');
    const validityLine = merchant.stampValidityDays
      ? isMember && merchant.cardStampsExpireAt
        ? t('merchant.stampsExpireOn', { date: formatDate(merchant.cardStampsExpireAt, locale) })
        : t('merchant.stampsValidity', { days: merchant.stampValidityDays })
      : null;
    return {
      rewards,
      isMember,
      balance,
      nextReward,
      hasReadyReward: isMember && rewards[0].cout <= balance,
      goal,
      earned: Math.min(balance, goal),
      earnLine,
      validityLine,
    };
  }, [merchant, t, locale]);
}
