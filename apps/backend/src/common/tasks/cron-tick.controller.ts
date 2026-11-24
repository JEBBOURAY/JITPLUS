import { Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CronTickAuthGuard } from './cron-tick-auth.guard';
import { CronTickService, TickResult, tickSlot } from './cron-tick.service';

/** POST /api/v1/internal/cron/tick, called every minute by Cloud Scheduler (job jitplus-cron-tick). */
@ApiExcludeController()
@Controller('internal/cron')
export class CronTickController {
  constructor(private readonly ticks: CronTickService) {}

  @Post('tick')
  @HttpCode(200)
  @SkipThrottle()
  @UseGuards(CronTickAuthGuard)
  tick(@Headers('x-cloudscheduler-scheduletime') scheduleTime?: string): Promise<TickResult> {
    return this.ticks.tick(tickSlot(scheduleTime));
  }
}
