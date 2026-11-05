import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { registerCronRunClaimer } from '../tasks/cron-utils';
import { MS_PER_DAY } from '../constants';

const RETENTION_MS = 30 * MS_PER_DAY;
/** Share of claims that also purge old rows (keeps the table tiny without a cron of its own). */
const PURGE_RATE = 0.01;

/**
 * Cross-instance "run once" guard for @Cron jobs.
 *
 * Every Cloud Run instance fires the same schedule. The scheduled minute
 * (rounded, so instances a few seconds apart agree) is the slot; inserting
 * (name, slot) succeeds for exactly one instance. Nothing to release, and a
 * crashed run cannot leave a stale lock behind.
 *
 * Registered into cron-utils at module init so the crons keep using the plain
 * `cronEnabledOnce` / `cronAllowedOnce` helpers without extra injection.
 */
@Injectable()
export class CronRunLock implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronRunLock.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    registerCronRunClaimer((name, now) => this.claim(name, now));
  }

  onModuleDestroy(): void {
    registerCronRunClaimer(null);
  }

  /** True when this instance owns the run of `name` for the minute around `now`. */
  async claim(name: string, now: Date = new Date()): Promise<boolean> {
    const slot = new Date(Math.round(now.getTime() / 60_000) * 60_000);
    try {
      await this.prisma.cronRun.create({ data: { name, slot } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.debug(`[${name}] already claimed by another instance for ${slot.toISOString()}`);
        return false;
      }
      // Fail closed: running without the guard could double-send to every user.
      this.logger.error(`[${name}] cron claim failed — skipping this run: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    if (Math.random() < PURGE_RATE) {
      this.prisma.cronRun
        .deleteMany({ where: { slot: { lt: new Date(now.getTime() - RETENTION_MS) } } })
        .catch((e: unknown) => this.logger.debug(`cron_runs purge failed: ${String(e)}`));
    }
    return true;
  }
}
