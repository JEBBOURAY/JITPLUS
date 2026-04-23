import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { LuckyWheelService } from './lucky-wheel.service';
import { LuckyWheelMerchantController } from './lucky-wheel-merchant.controller';
import { LuckyWheelClientController } from './lucky-wheel-client.controller';

@Module({
  imports: [PrismaModule, MerchantPlanModule],
  controllers: [LuckyWheelMerchantController, LuckyWheelClientController],
  providers: [LuckyWheelService],
  exports: [LuckyWheelService],
})
export class LuckyWheelModule {}
