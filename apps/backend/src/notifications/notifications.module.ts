import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ResendService } from './resend.service';
import { EmailQuotaService } from './email-quota.service';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { EMAIL_BLAST_PROVIDER, SMS_PROVIDER } from '../common/interfaces';
import { NoopSmsProvider } from '../common/providers/noop-sms.provider';

@Module({
  imports: [MerchantPlanModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ResendService,
    { provide: EMAIL_BLAST_PROVIDER, useExisting: ResendService },
    NoopSmsProvider,
    { provide: SMS_PROVIDER, useExisting: NoopSmsProvider },
    EmailQuotaService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
