import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClientAuthController, ClientController, PublicUnsubscribeController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientSessionService } from './client-session.service';
import { ClientOtpService } from './client-otp.service';
import { ClientOAuthService } from './client-oauth.service';
import { ClientService } from './client.service';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { MerchantModule } from '../merchant/merchant.module';
import { DealsModule } from '../deals/deals.module';
import { jwtModuleFactory } from '../common/jwt/jwt-module.factory';
import { SMS_PROVIDER } from '../common/interfaces';
import { NoopSmsProvider } from '../common/providers/noop-sms.provider';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync(jwtModuleFactory('jitplus-client', 'JWT_CLIENT_EXPIRATION', '2h')),
    MerchantPlanModule,
    MerchantModule,
    DealsModule,
  ],
  controllers: [ClientAuthController, ClientController, PublicUnsubscribeController],
  providers: [
    ClientAuthService,
    ClientSessionService,
    ClientOtpService,
    ClientOAuthService,
    ClientService,
    NoopSmsProvider,
    { provide: SMS_PROVIDER, useExisting: NoopSmsProvider },
  ],
  exports: [ClientAuthService, ClientService],
})
export class ClientAuthModule {}
