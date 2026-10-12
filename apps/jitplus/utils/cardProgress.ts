import { DEFAULT_STAMPS_GOAL } from '@/constants';
import type { LoyaltyCard } from '@/types';

export interface CardProgress {
  goal: number;
  earned: number;
  remaining: number;
  ratio: number;
  isComplete: boolean;
}

/** Single source of truth for a loyalty card's reward progress. */
export function getCardProgress(card: LoyaltyCard): CardProgress {
  const goal = Math.max(1, card.merchant?.minRewardCost ?? card.merchant?.stampsForReward ?? DEFAULT_STAMPS_GOAL);
  const earned = Math.min(Math.max(0, card.balance ?? 0), goal);
  return {
    goal,
    earned,
    remaining: goal - earned,
    ratio: earned / goal,
    isComplete: earned >= goal,
  };
}
