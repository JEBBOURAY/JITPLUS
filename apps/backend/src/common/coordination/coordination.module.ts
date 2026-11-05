import { Global, Module } from '@nestjs/common';
import { CronRunLock } from './cron-run-lock.service';
import { OtpSendLimiter } from './otp-send-limiter.service';

/**
 * State that must be shared by every Cloud Run instance (cron ownership, OTP
 * send cap) lives in Postgres, behind these providers.
 */
@Global()
@Module({
  providers: [CronRunLock, OtpSendLimiter],
  exports: [CronRunLock, OtpSendLimiter],
})
export class CoordinationModule {}
