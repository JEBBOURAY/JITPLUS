import { Module } from '@nestjs/common';
import { CronTickAuthGuard } from './cron-tick-auth.guard';
import { CronTickController } from './cron-tick.controller';
import { CronTickService } from './cron-tick.service';

@Module({
  controllers: [CronTickController],
  providers: [CronTickService, CronTickAuthGuard],
  exports: [CronTickService],
})
export class CronTickModule {}
