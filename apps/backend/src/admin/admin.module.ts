import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin.service';
import { AuditLogService } from './audit-log.service';
import { UpgradeRequestService } from '../merchant/services/upgrade-request.service';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { jwtModuleFactory } from '../common/jwt/jwt-module.factory';
import { AdminGuard } from '../auth/guards/admin.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync(jwtModuleFactory('jitplus-admin')),
    MerchantPlanModule,
  ],
  controllers: [AdminController],
  providers: [AdminAuthService, AuditLogService, UpgradeRequestService, AdminGuard],
  exports: [AuditLogService],
})
export class AdminModule {}
