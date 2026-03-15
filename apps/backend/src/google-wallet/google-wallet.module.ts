import { Module } from '@nestjs/common';
import { GoogleWalletService } from './google-wallet.service';
import { GoogleWalletController } from './google-wallet.controller';

@Module({
  controllers: [GoogleWalletController],
  providers: [GoogleWalletService],
  exports: [GoogleWalletService],
})
export class GoogleWalletModule {}
