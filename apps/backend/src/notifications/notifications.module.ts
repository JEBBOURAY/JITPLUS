import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ResendService } from './resend.service';
import { EmailQuotaService } from './email-quota.service';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { EMAIL_BLAST_PROVIDER, SMS_PROVIDER } from '../common/interfaces';
import { NoopSmsProvider } from '../common/providers/noop-sms.provider';
import { jwtModuleFactory } from '../common/jwt/jwt-module.factory';

@Module({
  imports: [
    MerchantPlanModule,
    // Needed by ResendService to sign per-recipient one-click unsubscribe tokens
    // (RFC 8058). Reuses the client JWT config so tokens are verifiable by the
    // public /public/unsubscribe controller.
    JwtModule.registerAsync(jwtModuleFactory('jitplus-client', 'JWT_CLIENT_EXPIRATION', '2h')),
  ],
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
