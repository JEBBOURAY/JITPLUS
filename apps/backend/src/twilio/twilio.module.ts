import { Module, Global } from '@nestjs/common';
import { TwilioService } from './twilio.service';
import { SMS_PROVIDER } from '../common/interfaces';

@Global()
@Module({
  providers: [
    TwilioService,
    { provide: SMS_PROVIDER, useExisting: TwilioService },
  ],
  exports: [TwilioService, SMS_PROVIDER],
})
export class TwilioModule {}
