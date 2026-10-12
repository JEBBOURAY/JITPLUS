import { Global, Module } from '@nestjs/common';
import { MerchantInboxService } from './merchant-inbox.service';

// Global so every push sender (auth, plan, crons…) can record into the inbox
// without each feature module importing this one.
@Global()
@Module({
  providers: [MerchantInboxService],
  exports: [MerchantInboxService],
})
export class MerchantInboxModule {}
