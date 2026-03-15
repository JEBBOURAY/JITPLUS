import { PointsRules } from '../interfaces/points-rules.interface';
import { DEFAULT_REWARD_THRESHOLD, DEFAULT_STAMPS_FOR_REWARD } from '../../common/constants';

/** Determine reward threshold from merchant settings */
export function computeRewardThreshold(
  merchant: { loyaltyType: string | null; stampsForReward: number | null } | null,
  pointsRules: PointsRules | null,
): number {
  return merchant?.loyaltyType === 'STAMPS'
    ? merchant?.stampsForReward || DEFAULT_STAMPS_FOR_REWARD
    : pointsRules?.rewardThreshold || DEFAULT_REWARD_THRESHOLD;
}
