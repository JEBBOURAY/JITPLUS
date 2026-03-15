import { Reward } from '../generated/client';
import { IRepository } from '../common/interfaces/repository.interface';

export interface IRewardRepository extends IRepository<Reward> {
  findAllByMerchant(merchantId: string, limit?: number): Promise<Reward[]>;
  findOneByMerchant(id: string, merchantId: string): Promise<Reward | null>;
}

export const REWARD_REPOSITORY = Symbol('REWARD_REPOSITORY');
