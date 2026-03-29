import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin.service';
import { AuditLogService } from './audit-log.service';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { jwtModuleFactory } from '../common/jwt/jwt-module.factory';
import { AdminGuard } from '../auth/guards/admin.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync(jwtModuleFactory('jitplus-admin')),
    MerchantPlanModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminAuthService, AuditLogService, AdminGuard],
  exports: [AuditLogService],
})
export class AdminModule {}
