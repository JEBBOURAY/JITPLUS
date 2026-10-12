import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogService } from '../admin/audit-log.service';
import { ScratchCampaignService } from './scratch-campaign.service';
import { ScratchPlayService } from './scratch-play.service';
import { CouponService } from './coupon.service';
import { ScratchPushService } from './scratch-push.service';
import { ScratchDispatchService } from './scratch-dispatch.service';
import { ScratchReminderService } from './scratch-reminder.service';
import { ScratchMerchantController } from './scratch-merchant.controller';
import { ScratchClientController } from './scratch-client.controller';

@Module({
  imports: [PrismaModule, MerchantPlanModule, NotificationsModule],
  controllers: [ScratchMerchantController, ScratchClientController],
  providers: [
    ScratchCampaignService,
    ScratchPlayService,
    CouponService,
    ScratchPushService,
    ScratchDispatchService,
    ScratchReminderService,
    AuditLogService,
  ],
  exports: [CouponService],
})
export class ScratchCardModule {}
