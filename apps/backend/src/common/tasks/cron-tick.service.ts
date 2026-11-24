import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { drainBackground } from './background-work';

// `cron` is only a dependency of @nestjs/schedule: take its job type from there.
type CronJob = ReturnType<SchedulerRegistry['getCronJobs']> extends Map<string, infer J> ? J : never;

/** How the @Cron jobs are triggered. */
export type CronMode = 'timer' | 'http';

export function cronMode(): CronMode {
  return (process.env.CRON_MODE ?? '').trim().toLowerCase() === 'http' ? 'http' : 'timer';
}

/** A tick older or newer than this is a stale retry or a wrong clock: skip it. */
export const TICK_MAX_SKEW_MS = 5 * 60_000;
/** Longest the tick waits for request side effects (pushes, e-mails) after the jobs. */
export const TICK_BACKGROUND_DRAIN_MS = 20_000;

export interface TickResult {
  slot: string;
  ran: number;
  skipped?: 'stale';
  backgroundLeft?: number;
}

/** True when `job` is scheduled exactly at `slot` (a whole minute), in the job's own time zone. */
export function isDueAt(job: CronJob, slot: Date): boolean {
  const next = job.cronTime.getNextDateFrom(new Date(slot.getTime() - 1000), job.cronTime.timeZone);
  return next.toMillis() === slot.getTime();
}

/** The minute a tick stands for: Cloud Scheduler's planned time when sent, else now. */
export function tickSlot(scheduleTime: string | undefined, now: Date = new Date()): Date {
  const planned = scheduleTime ? Date.parse(scheduleTime) : NaN;
  const at = Number.isFinite(planned) ? planned : now.getTime();
  return new Date(Math.floor(at / 60_000) * 60_000);
}

/**
 * Runs the @Cron jobs from an HTTP tick instead of in-process timers.
 *
 * With CPU allocated only during requests (Cloud Run request-based billing)
 * the timers fire late or not at all, so CRON_MODE=http stops them at boot and
 * Cloud Scheduler calls the tick once a minute. The @Cron decorators stay the
 * only source of schedules; the CronRunLock in each job still makes a slot run
 * once when several instances or a timer and a tick overlap.
 */
@Injectable()
export class CronTickService {
  private readonly logger = new Logger(CronTickService.name);
  /** Jobs that were running as timers when stopped (a `disabled` @Cron never was). */
  private tickJobs: CronJob[] | null = null;

  constructor(private readonly registry: SchedulerRegistry) {}

  /** Stops the in-process timers and hands their jobs to the tick. Call once after boot. */
  stopInProcessTimers(): number {
    const jobs = [...this.registry.getCronJobs().values()].filter((job) => job.isActive);
    for (const job of jobs) {
      // The tick awaits the run, and a run still going skips the next slot
      // instead of overlapping it (same as a slow timer today).
      job.waitForCompletion = true;
      void job.stop();
    }
    this.tickJobs = jobs;
    this.logger.log(`CRON_MODE=http: ${jobs.length} in-process cron timer(s) stopped, waiting for ticks`);
    return jobs.length;
  }

  async tick(slot: Date, now: Date = new Date()): Promise<TickResult> {
    if (Math.abs(now.getTime() - slot.getTime()) > TICK_MAX_SKEW_MS) {
      this.logger.warn(`Cron tick for ${slot.toISOString()} skipped: too far from now`);
      return { slot: slot.toISOString(), ran: 0, skipped: 'stale' };
    }
    const due = (this.tickJobs ?? []).filter((job) => isDueAt(job, slot));
    // In parallel: a tick costs the longest job, not the sum. Each job catches
    // its own errors; fireOnTick never rejects (errors go to its handler).
    const results = await Promise.allSettled(due.map((job) => job.fireOnTick()));
    for (const r of results) {
      if (r.status === 'rejected') this.logger.error(`Cron job failed in tick: ${String(r.reason)}`);
    }
    const backgroundLeft = await drainBackground(TICK_BACKGROUND_DRAIN_MS);
    if (backgroundLeft > 0) this.logger.warn(`Cron tick: ${backgroundLeft} background task(s) still pending`);
    return { slot: slot.toISOString(), ran: due.length, ...(backgroundLeft > 0 ? { backgroundLeft } : {}) };
  }
}
