import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { MAIL_PROVIDER } from '../common/interfaces';

@Global()
@Module({
  providers: [
    MailService,
    { provide: MAIL_PROVIDER, useExisting: MailService },
  ],
  exports: [MailService, MAIL_PROVIDER],
})
export class MailModule {}
