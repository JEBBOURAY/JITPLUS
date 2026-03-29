import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import {
  MerchantProfileService,
  MerchantClientService,
  MerchantTransactionService,
  MerchantDashboardService,
  MerchantTeamService,
  MerchantStoreService,
} from './services';
import { NotificationsModule } from '../notifications/notifications.module';
import { MerchantPlanModule } from './merchant-plan.module';

@Module({
  imports: [
    NotificationsModule,
    MerchantPlanModule,
  ],
  controllers: [MerchantController],
  providers: [
    MerchantProfileService,
    MerchantClientService,
    MerchantTransactionService,
    MerchantDashboardService,
    MerchantTeamService,
    MerchantStoreService,
  ],
  exports: [MerchantProfileService, MerchantPlanModule],
})
export class MerchantModule {}
