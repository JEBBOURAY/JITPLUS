import { Module } from '@nestjs/common';
import { DeeplinkController } from './deeplink.controller';
import { DealsModule } from '../deals/deals.module';

@Module({
  imports: [DealsModule],
  controllers: [DeeplinkController],
})
export class DeeplinkModule {}
