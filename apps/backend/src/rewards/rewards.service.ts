import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Reward } from '@prisma/client';
import { IRewardRepository, REWARD_REPOSITORY } from './reward.repository.interface';
import { REWARDS_CACHE_TTL } from '../common/constants';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { IStorageProvider, STORAGE_PROVIDER } from '../common/interfaces';

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private planService: MerchantPlanService,
    @Inject(STORAGE_PROVIDER) private storage: IStorageProvider,
  ) {}

  private async safeDeleteImage(url?: string | null): Promise<void> {
    if (!url) return;
    try {
      await this.storage.deleteFile(url);
    } catch (err) {
      this.logger.warn(`Reward image cleanup failed for ${url}: ${(err as Error).message}`);
    }
  }

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

  async create(merchantId: string, data: { titre: string; cout: number; description?: string; imageUrl?: string }): Promise<Reward> {
    if (data.cout <= 0) throw new BadRequestException('Le coût en points doit être supérieur à 0');

    // FREE plan: maximum 1 reward allowed
    const isPremium = await this.planService.isPremium(merchantId);
    if (!isPremium) {
      const existing = await this.rewardRepo.findAllByMerchant(merchantId, 1);
      if (existing.length >= 1) {
        throw new ForbiddenException(
          'Le plan Gratuit est limité à 1 cadeau. Passez au plan Pro pour des cadeaux illimités — contactez notre équipe sur WhatsApp.',
        );
      }
    }

    const reward = await this.rewardRepo.create({ ...data, merchantId });
    await this.invalidateCache(merchantId);
    return reward;
  }

  async update(id: string, merchantId: string, data: { titre?: string; cout?: number; description?: string; imageUrl?: string | null }): Promise<Reward> {
    if (data.cout !== undefined && data.cout <= 0) throw new BadRequestException('Le coût en points doit être supérieur à 0');
    const reward = await this.rewardRepo.findOneByMerchant(id, merchantId);
    if (!reward) throw new NotFoundException('Récompense non trouvée ou ne vous appartient pas');
    const updated = await this.rewardRepo.update(id, data);
    // Cleanup previous image if replaced or cleared
    if (data.imageUrl !== undefined && reward.imageUrl && reward.imageUrl !== data.imageUrl) {
      await this.safeDeleteImage(reward.imageUrl);
    }
    await this.invalidateCache(merchantId);
    return updated;
  }

  async remove(id: string, merchantId: string): Promise<Reward> {
    const reward = await this.rewardRepo.findOneByMerchant(id, merchantId);
    if (!reward) throw new NotFoundException('Récompense non trouvée ou ne vous appartient pas');
    const deleted = await this.rewardRepo.delete(id);
    await this.safeDeleteImage(deleted.imageUrl);
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
