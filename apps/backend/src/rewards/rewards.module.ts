import { Module } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { PrismaRewardRepository } from './prisma-reward.repository';
import { REWARD_REPOSITORY } from './reward.repository.interface';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';

@Module({
  imports: [MerchantPlanModule],
  controllers: [RewardsController],
  providers: [
    PrismaRewardRepository,
    { provide: REWARD_REPOSITORY, useExisting: PrismaRewardRepository },
    RewardsService,
  ],
  exports: [RewardsService, REWARD_REPOSITORY],
})
export class RewardsModule {}
