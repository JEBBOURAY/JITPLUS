import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeSlots, rangesFromOpeningHours, ResourceDay, Slot, WeeklyRange } from './availability';
import { addDaysYmd, parseYmd, timeZoneForCountry, wallTimeToUtc, zonedParts } from './booking-time';
import { ACTIVE_BOOKING_STATUSES, DEFAULT_SETTINGS, MAX_BOOKING_SPAN_MS } from './booking.constants';

type Db = PrismaService | Prisma.TransactionClient;

export interface BookingContext {
  merchant: { id: string; currency: string };
  settings: typeof DEFAULT_SETTINGS;
  tz: string;
  /** Opening hours of the fiche: the agenda follows them unless it has its own hours */
  shopHours: WeeklyRange[];
}

/** What slot computation needs from a service (see service()). */
export interface SlotService {
  id: string;
  durationMin: number;
  bufferMin: number;
  /** Active resources performing it */
  resources: { resourceId: string }[];
}

/**
 * Loads what slot computation needs (hours, exceptions, active bookings)
 * and runs the pure computeSlots() on it.
 */
@Injectable()
export class BookingAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Merchant + booking settings; throws unless the merchant takes bookings (when `requireEnabled`). */
  async context(merchantId: string, requireEnabled: boolean): Promise<BookingContext> {
    const merchant = await this.prisma.merchant.findFirst({
      where: { id: merchantId, deletedAt: null, isActive: true },
      select: { id: true, countryCode: true, currency: true, openingHours: true, bookingSettings: true },
    });
    if (!merchant) throw new NotFoundException('error.booking.merchantNotFound');
    const settings = { ...DEFAULT_SETTINGS, ...(merchant.bookingSettings ?? {}) };
    if (requireEnabled && !settings.enabled) {
      throw new BadRequestException('error.booking.notEnabled');
    }
    return {
      merchant: { id: merchant.id, currency: merchant.currency },
      settings,
      tz: timeZoneForCountry(merchant.countryCode),
      shopHours: rangesFromOpeningHours(merchant.openingHours),
    };
  }

  /** Active, bookable service of the merchant with its active resources. */
  async service(merchantId: string, serviceId: string) {
    const service = await this.prisma.bookableService.findFirst({
      where: { id: serviceId, merchantId, isActive: true, deletedAt: null },
      include: { resources: { where: { resource: { isActive: true } }, select: { resourceId: true } } },
    });
    if (!service) throw new NotFoundException('error.booking.serviceNotFound');
    return service;
  }

  /** Today and the last bookable day, in the merchant's zone. */
  bookableWindow(ctx: BookingContext, now = new Date()) {
    const today = zonedParts(ctx.tz, now).ymd;
    return { first: today, last: addDaysYmd(today, ctx.settings.maxAdvanceDays) };
  }

  /** Free starts of `service` (from service()) on local day `ymd`. */
  async slotsForDay(
    ctx: BookingContext,
    service: SlotService,
    ymd: string,
    opts: { now?: Date } = {},
  ): Promise<Slot[]> {
    if (!parseYmd(ymd)) throw new BadRequestException('error.booking.invalidDate');
    return (await this.slotsForDays(ctx, service, [ymd], opts)).get(ymd) ?? [];
  }

  /**
   * Free starts of `service` on each local day of `ymds` (invalid or out of the
   * bookable window: none). Hours, closures and bookings are read once for the
   * whole range, so a month of days costs three queries.
   */
  async slotsForDays(
    ctx: BookingContext,
    service: SlotService,
    ymds: string[],
    opts: { now?: Date } = {},
  ): Promise<Map<string, Slot[]>> {
    const now = opts.now ?? new Date();
    const result = new Map<string, Slot[]>(ymds.map((d) => [d, []]));
    const { first, last } = this.bookableWindow(ctx, now);
    const days = [...new Set(ymds)].filter((d) => parseYmd(d) && d >= first && d <= last).sort();
    const resourceIds = service.resources.map((r) => r.resourceId);
    if (!days.length || !resourceIds.length) return result;

    const rangeStart = wallTimeToUtc(ctx.tz, days[0], 0);
    const rangeEnd = wallTimeToUtc(ctx.tz, days[days.length - 1], 1440);
    // A booking that starts the day before can still run into the first day.
    const lookBack = new Date(rangeStart.getTime() - MAX_BOOKING_SPAN_MS);

    const [hours, exceptions, bookings] = await Promise.all([
      // Every weekday: a resource without any row follows the opening hours.
      this.prisma.workingHours.findMany({ where: { resourceId: { in: resourceIds } } }),
      this.prisma.availabilityException.findMany({
        where: {
          merchantId: ctx.merchant.id,
          OR: [{ resourceId: null }, { resourceId: { in: resourceIds } }],
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          resourceId: { in: resourceIds },
          status: { in: ACTIVE_BOOKING_STATUSES },
          startsAt: { gte: lookBack, lt: rangeEnd },
          blockedUntil: { gt: rangeStart },
        },
        select: { resourceId: true, startsAt: true, blockedUntil: true },
      }),
    ]);

    const notBefore = new Date(now.getTime() + ctx.settings.minNoticeMinutes * 60_000);
    for (const ymd of days) {
      const dayStart = wallTimeToUtc(ctx.tz, ymd, 0);
      const dayEnd = wallTimeToUtc(ctx.tz, ymd, 1440);
      const resources: ResourceDay[] = resourceIds.map((id) => {
        const own = hours.filter((h) => h.resourceId === id);
        return {
          id,
          hours: own.length ? own : ctx.shopHours,
          exceptions: exceptions.filter(
            (e) => (e.resourceId === null || e.resourceId === id) && e.startsAt < dayEnd && e.endsAt > dayStart,
          ),
          busy: bookings.filter((b) => b.resourceId === id && b.startsAt < dayEnd && b.blockedUntil > dayStart),
        };
      });
      result.set(ymd, computeSlots(resources, {
        tz: ctx.tz,
        ymd,
        durationMin: service.durationMin,
        bufferMin: service.bufferMin,
        stepMin: ctx.settings.slotStepMinutes,
        notBefore,
      }));
    }
    return result;
  }

  /** True when an active booking of `resourceId` overlaps [start, blockedUntil). */
  async overlaps(db: Db, resourceId: string, start: Date, blockedUntil: Date, ignoreId?: string): Promise<boolean> {
    const n = await db.booking.count({
      where: {
        resourceId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startsAt: { gt: new Date(start.getTime() - MAX_BOOKING_SPAN_MS), lt: blockedUntil },
        blockedUntil: { gt: start },
        ...(ignoreId && { id: { not: ignoreId } }),
      },
    });
    return n > 0;
  }
}
