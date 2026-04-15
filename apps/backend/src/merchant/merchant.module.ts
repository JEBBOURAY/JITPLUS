import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import {
  MerchantTeamController,
  MerchantStoreController,
  MerchantTransactionController,
} from './controllers';
import {
  MerchantProfileService,
  MerchantClientService,
  MerchantTransactionService,
  MerchantDashboardService,
  MerchantTeamService,
  MerchantStoreService,
} from './services';
import { AuditLogService } from '../admin/audit-log.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MerchantPlanModule } from './merchant-plan.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    NotificationsModule,
    MerchantPlanModule,
    EventsModule,
  ],
  controllers: [
    MerchantController,
    MerchantTeamController,
    MerchantStoreController,
    MerchantTransactionController,
  ],
  providers: [
    MerchantProfileService,
    MerchantClientService,
    MerchantTransactionService,
    MerchantDashboardService,
    MerchantTeamService,
    MerchantStoreService,
    AuditLogService,
  ],
  exports: [MerchantProfileService, MerchantPlanModule],
})
export class MerchantModule {}
