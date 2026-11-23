import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScratchCardModule } from '../scratch-card/scratch-card.module';
import { CollectionsService } from './collections.service';
import { CollectionProgressService } from './collection-progress.service';
import { CollectionMaintenanceService } from './collection-maintenance.service';
import { CollectionsMerchantController } from './collections-merchant.controller';
import { CollectionsClientController } from './collections-client.controller';

/** Collection game. The gift is a coupon, so CouponService comes from the scratch-card module. */
@Module({
  imports: [PrismaModule, MerchantPlanModule, NotificationsModule, ScratchCardModule],
  controllers: [CollectionsMerchantController, CollectionsClientController],
  providers: [CollectionsService, CollectionProgressService, CollectionMaintenanceService],
})
export class CollectionsModule {}
