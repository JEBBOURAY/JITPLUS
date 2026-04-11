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
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    NotificationsModule,
    MerchantPlanModule,
    EventsModule,
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
