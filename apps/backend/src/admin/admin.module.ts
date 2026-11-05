import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminMerchantsController } from './admin-merchants.controller';
import { AdminClientsController } from './admin-clients.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminReferralsController } from './admin-referrals.controller';
import { AdminAuthService } from './admin.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminMerchantService } from './admin-merchants.service';
import { AdminClientService } from './admin-clients.service';
import { AdminReferralService } from './admin-referral.service';
import { AuditLogService } from './audit-log.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminDetailsService } from './admin-details.service';
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
  // All share the 'admin' prefix. Order kept from the former single controller;
  // no route of one controller shadows a route of another.
  controllers: [
    AdminController,
    AdminDashboardController,
    AdminMerchantsController,
    AdminClientsController,
    AdminNotificationsController,
    AdminReferralsController,
  ],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminMerchantService,
    AdminClientService,
    AdminReferralService,
    AdminInsightsService,
    AdminDetailsService,
    AuditLogService,
    AdminGuard,
  ],
  exports: [AuditLogService],
})
export class AdminModule {}
