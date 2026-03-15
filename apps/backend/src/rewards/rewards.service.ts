import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Reward } from '../generated/client';
import { IRewardRepository, REWARD_REPOSITORY } from './reward.repository.interface';
import { REWARDS_CACHE_TTL } from '../common/constants';

@Injectable()
export class RewardsService {
  constructor(
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  private rewardsCacheKey(merchantId: string): string {
    return `rewards:list:${merchantId}`;
  }

  async findAll(merchantId: string): Promise<Reward[]> {
    const cacheKey = this.rewardsCacheKey(merchantId);
    const cached = await this.cache.get<Reward[]>(cacheKey);
    if (cached) return cached;

    const rewards = await this.rewardRepo.findAllByMerchant(merchantId);
    await this.cache.set(cacheKey, rewards, REWARDS_CACHE_TTL);
    return rewards;
  }

  async findOne(id: string, merchantId: string): Promise<Reward> {
    const reward = await this.rewardRepo.findOneByMerchant(id, merchantId);
    if (!reward) throw new NotFoundException('Récompense non trouvée');
    return reward;
  }

  async create(merchantId: string, data: { titre: string; cout: number; description?: string }): Promise<Reward> {
    if (data.cout <= 0) throw new BadRequestException('Le coût en points doit être supérieur à 0');
    const reward = await this.rewardRepo.create({ ...data, merchantId });
    await this.invalidateCache(merchantId);
    return reward;
  }

  async update(id: string, merchantId: string, data: { titre?: string; cout?: number; description?: string }): Promise<Reward> {
    if (data.cout !== undefined && data.cout <= 0) throw new BadRequestException('Le coût en points doit être supérieur à 0');
    const reward = await this.rewardRepo.findOneByMerchant(id, merchantId);
    if (!reward) throw new NotFoundException('Récompense non trouvée ou ne vous appartient pas');
    const updated = await this.rewardRepo.update(id, data);
    await this.invalidateCache(merchantId);
    return updated;
  }

  async remove(id: string, merchantId: string): Promise<Reward> {
    const reward = await this.rewardRepo.findOneByMerchant(id, merchantId);
    if (!reward) throw new NotFoundException('Récompense non trouvée ou ne vous appartient pas');
    const deleted = await this.rewardRepo.delete(id);
    await this.invalidateCache(merchantId);
    return deleted;
  }

  private async invalidateCache(merchantId: string): Promise<void> {
    await Promise.all([
      this.cache.del(this.rewardsCacheKey(merchantId)),
      // Also invalidate the client-facing merchant detail (contains rewards)
      this.cache.del(`merchant:detail:${merchantId}`),
    ]);
  }
}
