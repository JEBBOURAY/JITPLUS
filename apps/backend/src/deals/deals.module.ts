import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogService } from '../admin/audit-log.service';
import { DealsMerchantService } from './deals-merchant.service';
import { DealsClientService } from './deals-client.service';
import { DealsAdminService } from './deals-admin.service';
import { DealsMaintenanceService } from './deals-maintenance.service';
import { DealsAlertsService } from './deals-alerts.service';
import {
  DealsAdminController,
  DealsClientController,
  DealsGuestController,
  DealsMerchantController,
} from './deals.controller';

@Module({
  imports: [PrismaModule],
  controllers: [DealsMerchantController, DealsClientController, DealsGuestController, DealsAdminController],
  providers: [DealsMerchantService, DealsClientService, DealsAdminService, DealsMaintenanceService, DealsAlertsService, AuditLogService],
  exports: [DealsClientService],
})
export class DealsModule {}
