import { Global, Module } from '@nestjs/common';
import { MerchantInboxService } from './merchant-inbox.service';
import { MerchantNotifierService } from './merchant-notifier.service';
import { MerchantNewsService } from './merchant-news.service';

// Global so every push sender (auth, plan, crons…) can record into the inbox
// and notify merchants without each feature module importing this one.
@Global()
@Module({
  providers: [MerchantInboxService, MerchantNotifierService, MerchantNewsService],
  exports: [MerchantInboxService, MerchantNotifierService, MerchantNewsService],
})
export class MerchantInboxModule {}
