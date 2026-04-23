import { Module } from '@nestjs/common';
import { MerchantPlanService } from './services/merchant-plan.service';
import { MerchantReferralService } from './services/merchant-referral.service';

import { ClientReferralService } from '../client-auth/client-referral.service';

/**
 * Standalone module for plan & referral services.
 * Extracted so that multiple modules (Auth, Admin, Notifications, Merchant)
 * can share the SAME singleton instances — avoiding cache incoherence where
 * an admin approval in one instance isn't reflected in another module's cache.
 *
 * MerchantPlanModule has no upstream module imports, which also prevents the
 * circular dependency that would arise if NotificationsModule tried to import
 * MerchantModule (which itself imports NotificationsModule).
 */
@Module({
  providers: [MerchantPlanService, MerchantReferralService, ClientReferralService],
  exports: [MerchantPlanService, MerchantReferralService, ClientReferralService],
})
export class MerchantPlanModule {}
