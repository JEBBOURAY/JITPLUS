import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantModule } from '../merchant/merchant.module';
import { AuditLogService } from '../admin/audit-log.service';
import { StampCodeTokenService } from './stamp-code-token.service';
import { StampCodesService } from './stamp-codes.service';
import { StampCodesMerchantController } from './stamp-codes-merchant.controller';
import { StampCodesClientController } from './stamp-codes-client.controller';

/** E-commerce QR codes: single-use codes slipped into parcels, scanned by the client. */
@Module({
  // MerchantModule re-exports MerchantPlanModule (plan / quota checks)
  imports: [PrismaModule, MerchantModule],
  controllers: [StampCodesMerchantController, StampCodesClientController],
  providers: [StampCodeTokenService, StampCodesService, AuditLogService],
})
export class StampCodesModule {}
