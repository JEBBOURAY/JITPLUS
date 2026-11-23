import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { cronEnabledOnce, mapLimit } from '../common/tasks/cron-utils';
import { BookingNotifyService } from './booking-notify.service';
import { AUTO_COMPLETE_AFTER_MS, PENDING_EXPIRY_HOURS, PENDING_REMINDER_BEFORE_MS } from './booking.constants';

const HOUR = 3_600_000;
const BATCH = 200;
const PUSH_CONCURRENCY = 8;

/**
 * Booking crons, each claimed by one instance per run (CronRunLock):
 * - unanswered requests expire after PENDING_EXPIRY_HOURS or at their start;
 * - reminders the day before and 2 h before;
 * - bookings past their end are closed.
 * Every row is claimed with a conditional update, so a merchant action
 * made meanwhile wins and nothing is sent twice.
 * Not gated by the marketing quiet hours (cronAllowedOnce): these are state
 * changes and transactional pushes, and a skipped run would free slots late
 * and drop the 2 h reminder of every booking starting before 11:00.
 */
@Injectable()
export class BookingTasksService {
  private readonly logger = new Logger(BookingTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: BookingNotifyService,
  ) {}

  @Cron('*/5 * * * *')
  async expirePending(now = new Date()): Promise<number> {
    if (!(await cronEnabledOnce(this.logger, 'BookingTasks.expirePending', now))) return 0;
    const rows = await this.prisma.booking.findMany({
      where: {
        status: 'PENDING',
        OR: [{ createdAt: { lte: new Date(now.getTime() - PENDING_EXPIRY_HOURS * HOUR) } }, { startsAt: { lte: now } }],
      },
      take: BATCH,
    });
    let done = 0;
    await this.forEachBooking(rows, async (b) => {
      const { count } = await this.prisma.booking.updateMany({
        where: { id: b.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (!count) return;
      done++;
      const updated = { ...b, status: 'EXPIRED' as const };
      this.notify.changed(updated, 'status');
      await Promise.all([
        this.notify.toClient(updated, 'expired'),
        this.notify.toMerchant(updated, 'requestExpired'),
      ]);
    });
    if (done) this.logger.log(`expired ${done} unanswered booking request(s)`);
    return done;
  }

  /**
   * A request expires PENDING_EXPIRY_HOURS after it was made, or at its start.
   * Once, PENDING_REMINDER_BEFORE_MS before that, the merchant is reminded, so
   * the client is not left with an "expired" answer by mere oversight. A request
   * made less than an hour before that point needs no reminder: the "new
   * request" push is still fresh.
   */
  @Cron('*/5 * * * *')
  async remindPending(now = new Date()): Promise<number> {
    if (!(await cronEnabledOnce(this.logger, 'BookingTasks.remindPending', now))) return 0;
    const t = now.getTime();
    const soon = new Date(t + PENDING_REMINDER_BEFORE_MS);
    const rows = await this.prisma.booking.findMany({
      where: {
        status: 'PENDING',
        pendingReminderSentAt: null,
        startsAt: { gt: now },
        OR: [
          { createdAt: { lte: new Date(soon.getTime() - PENDING_EXPIRY_HOURS * HOUR) } },
          { startsAt: { lte: soon } },
        ],
      },
      take: BATCH,
    });
    let sent = 0;
    await this.forEachBooking(rows, async (b) => {
      const expiresAt = Math.min(b.createdAt.getTime() + PENDING_EXPIRY_HOURS * HOUR, b.startsAt.getTime());
      const tooRecent = expiresAt - PENDING_REMINDER_BEFORE_MS - b.createdAt.getTime() < HOUR;
      const { count } = await this.prisma.booking.updateMany({
        where: { id: b.id, status: 'PENDING', pendingReminderSentAt: null },
        data: { pendingReminderSentAt: now },
      });
      if (!count || tooRecent) return;
      sent++;
      await this.notify.toMerchant(b, 'pendingReminder');
    });
    return sent;
  }

  @Cron('*/5 * * * *')
  async sendReminders(now = new Date()): Promise<{ day: number; hour: number }> {
    if (!(await cronEnabledOnce(this.logger, 'BookingTasks.sendReminders', now))) return { day: 0, hour: 0 };
    const t = now.getTime();

    // Day before: 24 h ahead, for bookings made more than a day in advance.
    const dayRows = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        reminderDaySentAt: null,
        startsAt: { gt: new Date(t + 3 * HOUR), lte: new Date(t + 24 * HOUR) },
        createdAt: { lte: new Date(t - 2 * HOUR) },
        clientId: { not: null },
      },
      take: BATCH,
    });
    // 2 h before, for bookings made at least 3 h ahead of their start.
    const hourRows = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        reminderHourSentAt: null,
        startsAt: { gt: now, lte: new Date(t + 2 * HOUR) },
        clientId: { not: null },
      },
      take: BATCH,
    });

    let day = 0;
    let hour = 0;
    await this.forEachBooking(dayRows, async (b) => {
      if (b.startsAt.getTime() - b.createdAt.getTime() < 24 * HOUR) {
        // Booked less than a day ahead: the confirmation is reminder enough.
        await this.prisma.booking.updateMany({ where: { id: b.id, reminderDaySentAt: null }, data: { reminderDaySentAt: now } });
        return;
      }
      const { count } = await this.prisma.booking.updateMany({
        where: { id: b.id, status: 'CONFIRMED', reminderDaySentAt: null },
        data: { reminderDaySentAt: now },
      });
      if (!count) return;
      day++;
      await this.notify.toClient(b, 'reminderDay');
    });
    await this.forEachBooking(hourRows, async (b) => {
      const tooRecent = b.startsAt.getTime() - b.createdAt.getTime() < 3 * HOUR;
      const { count } = await this.prisma.booking.updateMany({
        where: { id: b.id, status: 'CONFIRMED', reminderHourSentAt: null },
        data: { reminderHourSentAt: now },
      });
      if (!count || tooRecent) return;
      hour++;
      await this.notify.toClient(b, 'reminderHour');
    });
    return { day, hour };
  }

  /**
   * Checked-in bookings close at their end. Confirmed bookings never checked
   * in close a day later: the merchant had that long to mark an absence.
   */
  @Cron('*/15 * * * *')
  async completePast(now = new Date()): Promise<number> {
    if (!(await cronEnabledOnce(this.logger, 'BookingTasks.completePast', now))) return 0;
    const confirmedEnd = new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS);
    // startsAt < endsAt: the extra bound keeps the scan on (status, starts_at).
    const [checkedIn, confirmed] = await Promise.all([
      this.prisma.booking.updateMany({
        where: { status: 'CHECKED_IN', startsAt: { lt: now }, endsAt: { lte: now } },
        data: { status: 'COMPLETED' },
      }),
      this.prisma.booking.updateMany({
        where: { status: 'CONFIRMED', startsAt: { lt: confirmedEnd }, endsAt: { lte: confirmedEnd } },
        data: { status: 'COMPLETED' },
      }),
    ]);
    return checkedIn.count + confirmed.count;
  }

  /** Bounded concurrency; one failing booking is logged and never stops the rest of the run. */
  private async forEachBooking<T extends { id: string }>(rows: T[], fn: (row: T) => Promise<void>): Promise<void> {
    await mapLimit(rows, PUSH_CONCURRENCY, async (row) => {
      try {
        await fn(row);
      } catch (e) {
        this.logger.warn(`booking ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }
}
