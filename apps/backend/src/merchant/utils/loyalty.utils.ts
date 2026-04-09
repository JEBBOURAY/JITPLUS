import { PointsRules } from '../interfaces/points-rules.interface';
import { DEFAULT_REWARD_THRESHOLD, DEFAULT_STAMPS_FOR_REWARD } from '../../common/constants';

/** Determine reward threshold from merchant settings */
export function computeRewardThreshold(
  merchant: { loyaltyType: string | null; stampsForReward: number | null; rewards?: { cout: number }[] } | null,
  pointsRules: PointsRules | null,
): number {
  if (merchant?.loyaltyType === 'STAMPS') {
    if (merchant.rewards && merchant.rewards.length > 0) {
      return Math.min(...merchant.rewards.map(r => r.cout));
    }
    return merchant?.stampsForReward || DEFAULT_STAMPS_FOR_REWARD;
  }
  
  if (merchant?.rewards && merchant.rewards.length > 0) {
    return Math.min(...merchant.rewards.map(r => r.cout));
  }
  return pointsRules?.rewardThreshold || DEFAULT_REWARD_THRESHOLD;
}
