import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_OTP_SENDS_PER_DAY, MS_PER_DAY } from '../constants';

const RETENTION_DAYS = 2;
const PURGE_RATE = 0.01;

/** UTC calendar day of `now`, as the DATE the counter is keyed on. */
function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Daily OTP send cap per identifier (email or phone), stored in Postgres so it
 * holds across Cloud Run instances and restarts — it bounds SMS / email cost.
 */
@Injectable()
export class OtpSendLimiter {
  private readonly logger = new Logger(OtpSendLimiter.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Counts one send for `identifier` today. Throws 429 once the daily cap is
   * exceeded. The increment is a single atomic UPSERT, so concurrent sends
   * cannot slip past the cap.
   */
  async consume(identifier: string, now: Date = new Date()): Promise<void> {
    const day = utcDay(now);
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      INSERT INTO "otp_send_counters" ("identifier", "day", "count")
      VALUES (${identifier}, ${day}::date, 1)
      ON CONFLICT ("identifier", "day")
      DO UPDATE SET "count" = "otp_send_counters"."count" + 1
      RETURNING "count"
    `);

    if (Math.random() < PURGE_RATE) {
      const cutoff = new Date(day.getTime() - RETENTION_DAYS * MS_PER_DAY);
      this.prisma.otpSendCounter
        .deleteMany({ where: { day: { lt: cutoff } } })
        .catch((e: unknown) => this.logger.debug(`otp_send_counters purge failed: ${String(e)}`));
    }

    if ((rows[0]?.count ?? 0) > MAX_OTP_SENDS_PER_DAY) {
      throw new HttpException(
        `Limite quotidienne atteinte (${MAX_OTP_SENDS_PER_DAY} codes/jour). Réessayez demain.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
