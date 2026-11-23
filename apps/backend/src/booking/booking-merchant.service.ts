import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, MerchantCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertClean } from '../common/utils/content-moderation';
import { maskName } from '../common/utils';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { rangesFromOpeningHours } from './availability';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingNotifyService } from './booking-notify.service';
import { timeZoneForCountry } from './booking-time';
import { attachVisitTransaction, CREDITABLE_BOOKING_STATUSES, VISIT_BOOKING_SELECT, type VisitBooking } from './booking-visit';
import {
  ACTIVE_BOOKING_STATUSES,
  CHECKIN_WINDOW_MS,
  DEFAULT_SETTINGS,
  MAX_AGENDA_DAYS,
  MAX_BOOKING_SPAN_MS,
  MAX_SERVICES,
  isOverlapViolation,
} from './booking.constants';
import {
  AgendaQueryDto,
  CreateExceptionDto,
  CreateServiceDto,
  HourRangeDto,
  MerchantCreateBookingDto,
  RescheduleBookingDto,
  UpdateBookingSettingsDto,
  UpdateServiceDto,
} from './dto';

/** Rejects overlapping ranges on one weekday. */
export function assertValidRanges(ranges: HourRangeDto[]): void {
  for (const r of ranges) {
    if (r.endMin <= r.startMin) throw new BadRequestException('error.booking.rangeEndBeforeStart');
  }
  for (let d = 1; d <= 7; d++) {
    const day = ranges.filter((r) => r.weekday === d).sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < day.length; i++) {
      if (day[i].startMin < day[i - 1].endMin) throw new BadRequestException('error.booking.rangesOverlap');
    }
  }
}

/** Status changes a merchant may make, from → to. */
const TRANSITIONS: Record<'confirm' | 'decline' | 'cancel' | 'no-show' | 'check-in' | 'complete', { from: BookingStatus[]; to: BookingStatus }> = {
  confirm: { from: ['PENDING'], to: 'CONFIRMED' },
  decline: { from: ['PENDING'], to: 'DECLINED' },
  cancel: { from: ['PENDING', 'CONFIRMED'], to: 'CANCELLED_MERCHANT' },
  'no-show': { from: ['CONFIRMED'], to: 'NO_SHOW' },
  'check-in': { from: ['CONFIRMED'], to: 'CHECKED_IN' },
  complete: { from: ['CHECKED_IN', 'CONFIRMED'], to: 'COMPLETED' },
};
export type MerchantBookingAction = keyof typeof TRANSITIONS;

/**
 * Reminder flags of a booking that was just moved. The "moved" push already
 * tells the client the new time: a reminder whose window the new start is
 * already inside counts as sent. Resetting both let the cron follow the push
 * within minutes, or say "tomorrow" for a visit moved to today.
 */
export function remindersAfterMove(startsAt: Date, now: Date): { reminderDaySentAt: Date | null; reminderHourSentAt: Date | null } {
  const ahead = startsAt.getTime() - now.getTime();
  return {
    reminderDaySentAt: ahead < 24 * 3_600_000 ? now : null,
    reminderHourSentAt: ahead < 3 * 3_600_000 ? now : null,
  };
}
export const MERCHANT_BOOKING_ACTIONS = Object.keys(TRANSITIONS) as MerchantBookingAction[];

/**
 * The client of a booking as the merchant may see them, with their active
 * loyalty card here: without one, stamps need a scan of their QR code.
 */
const merchantViewInclude = (merchantId: string) =>
  ({
    client: {
      select: {
        id: true,
        prenom: true,
        nom: true,
        telephone: true,
        shareInfoMerchants: true,
        loyaltyCards: { where: { merchantId, deactivatedAt: null }, select: { id: true, consentPending: true } },
      },
    },
  }) satisfies Prisma.BookingInclude;
type MerchantViewBooking = Prisma.BookingGetPayload<{ include: ReturnType<typeof merchantViewInclude> }>;

@Injectable()
export class BookingMerchantService {
  private readonly logger = new Logger(BookingMerchantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: BookingAvailabilityService,
    private readonly notify: BookingNotifyService,
  ) {}

  // ── Setup ───────────────────────────────────────────────────

  /**
   * The merchant's single calendar. The merchant row is locked on creation, so
   * two first calls still create one.
   */
  private async calendarId(merchantId: string): Promise<string> {
    const query = { where: { merchantId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } } as const;
    const existing = await this.prisma.bookingResource.findFirst(query);
    if (existing) return existing.id;
    return this.prisma.$transaction(async (tx) => {
      const [merchant] = await tx.$queryRaw<{ nom: string }[]>`SELECT nom FROM merchants WHERE id = ${merchantId} AND deleted_at IS NULL FOR UPDATE`;
      if (!merchant) throw new NotFoundException('error.booking.merchantNotFound');
      const created = await tx.bookingResource.findFirst(query);
      return created?.id ?? (await tx.bookingResource.create({ data: { merchantId, nom: merchant.nom }, select: { id: true } })).id;
    });
  }

  private calendarHours(resourceId: string) {
    return this.prisma.workingHours.findMany({
      where: { resourceId },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
      select: { weekday: true, startMin: true, endMin: true },
    });
  }

  /**
   * Active seats of the calendar, main calendar first. A capacity of N gives
   * N seats: the extra ones copy the main calendar's hours and services, and a
   * booking takes the first free seat.
   */
  private async seatIds(merchantId: string): Promise<string[]> {
    const mainId = await this.calendarId(merchantId);
    const rows = await this.prisma.bookingResource.findMany({
      where: { merchantId, isActive: true, teamMemberId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return [mainId, ...rows.map((r) => r.id).filter((id) => id !== mainId)];
  }

  /**
   * Makes the calendar hold `capacity` seats. Seats taken away are only
   * deactivated: their upcoming bookings stay, and a later raise reuses them.
   */
  private async syncSeats(merchantId: string, capacity: number): Promise<void> {
    const mainId = await this.calendarId(merchantId);
    await this.prisma.$transaction(async (tx) => {
      // Two saves at once must not both create the missing seats.
      await tx.$queryRaw`SELECT id FROM merchants WHERE id = ${merchantId} FOR UPDATE`;
      const extras = (await tx.bookingResource.findMany({
        where: { merchantId, teamMemberId: null, id: { not: mainId } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, isActive: true },
      }));
      const wanted = Math.max(0, capacity - 1);
      const keep = extras.slice(0, wanted);
      const drop = extras.slice(wanted).filter((r) => r.isActive).map((r) => r.id);
      const revive = keep.filter((r) => !r.isActive).map((r) => r.id);
      if (drop.length) await tx.bookingResource.updateMany({ where: { id: { in: drop } }, data: { isActive: false } });
      if (revive.length) await tx.bookingResource.updateMany({ where: { id: { in: revive } }, data: { isActive: true } });
      const seats = keep.map((r) => r.id);
      for (let n = seats.length; n < wanted; n++) {
        const seat = await tx.bookingResource.create({ data: { merchantId, nom: `Poste ${n + 2}` }, select: { id: true } });
        seats.push(seat.id);
      }
      if (seats.length) await this.copyMainCalendar(tx, mainId, seats);
    });
  }

  /** Gives `seatIds` the hours and services of the main calendar. */
  private async copyMainCalendar(tx: Prisma.TransactionClient, mainId: string, seatIds: string[]): Promise<void> {
    const [hours, links] = await Promise.all([
      tx.workingHours.findMany({ where: { resourceId: mainId }, select: { weekday: true, startMin: true, endMin: true } }),
      tx.serviceResource.findMany({ where: { resourceId: mainId }, select: { serviceId: true } }),
    ]);
    await tx.workingHours.deleteMany({ where: { resourceId: { in: seatIds } } });
    if (hours.length) {
      await tx.workingHours.createMany({ data: seatIds.flatMap((resourceId) => hours.map((h) => ({ resourceId, ...h }))) });
    }
    await tx.serviceResource.deleteMany({ where: { resourceId: { in: seatIds } } });
    if (links.length) {
      await tx.serviceResource.createMany({
        data: seatIds.flatMap((resourceId) => links.map((l) => ({ resourceId, serviceId: l.serviceId }))),
        skipDuplicates: true,
      });
    }
  }

  /** Everything the Pro app's booking settings screen needs, in one call. */
  async setup(merchantId: string) {
    const merchant = await this.prisma.merchant.findFirst({
      where: { id: merchantId, deletedAt: null },
      select: { categorie: true, secondaryCategories: true, openingHours: true, currency: true, countryCode: true, bookingSettings: true },
    });
    if (!merchant) throw new NotFoundException('error.booking.merchantNotFound');

    const calendarId = await this.calendarId(merchantId);
    const categories: MerchantCategory[] = [merchant.categorie, ...merchant.secondaryCategories];
    const [services, hours, templates, exceptions] = await Promise.all([
      this.listServices(merchantId),
      this.calendarHours(calendarId),
      this.prisma.serviceTemplate.findMany({
        where: { category: { in: categories }, isActive: true },
        orderBy: [{ category: 'asc' }, { order: 'asc' }],
        select: { id: true, category: true, nom: true, description: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { merchantId, endsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 100,
      }),
    ]);

    return {
      settings: { ...DEFAULT_SETTINGS, ...(merchant.bookingSettings ?? {}) },
      currency: merchant.currency,
      timeZone: timeZoneForCountry(merchant.countryCode),
      services,
      hours,
      openingHours: rangesFromOpeningHours(merchant.openingHours),
      templates,
      exceptions,
    };
  }

  async updateSettings(merchantId: string, dto: UpdateBookingSettingsDto) {
    if (dto.enabled) {
      const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { openingHours: true } });
      const hasShopHours = rangesFromOpeningHours(merchant?.openingHours).length > 0;
      const ready = await this.prisma.bookableService.count({
        where: {
          merchantId,
          isActive: true,
          deletedAt: null,
          resources: { some: { resource: { isActive: true, ...(!hasShopHours && { workingHours: { some: {} } }) } } },
        },
      });
      if (!ready) {
        throw new BadRequestException('error.booking.setupFirst');
      }
    }
    if (dto.capacity != null) await this.syncSeats(merchantId, dto.capacity);
    // @IsOptional() lets null through: none of these columns is nullable.
    const data = Object.fromEntries(Object.entries(dto).filter(([, v]) => v != null));
    const settings = await this.prisma.bookingSettings.upsert({
      where: { merchantId },
      create: { merchantId, ...data },
      update: data,
    });
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  // ── Services ────────────────────────────────────────────────

  async listServices(merchantId: string) {
    const rows = await this.prisma.bookableService.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(({ priceFrom, deletedAt: _d, ...s }) => ({
      ...s,
      priceFrom: priceFrom === null ? null : Number(priceFrom),
      isCustom: s.templateId === null,
    }));
  }

  /**
   * From the catalogue (templateId) or custom (nom only). Duration and
   * price always come from the merchant, never from the catalogue.
   */
  async createService(merchantId: string, dto: CreateServiceDto) {
    const count = await this.prisma.bookableService.count({ where: { merchantId, deletedAt: null } });
    if (count >= MAX_SERVICES) throw new BadRequestException('error.booking.maxServices');

    let nom = dto.nom?.trim();
    let description = dto.description?.trim() || null;
    if (dto.templateId) {
      const tpl = await this.prisma.serviceTemplate.findFirst({ where: { id: dto.templateId, isActive: true } });
      if (!tpl) throw new NotFoundException('error.booking.templateNotFound');
      nom = nom || tpl.nom;
      description = description ?? tpl.description;
    }
    if (!nom) throw new BadRequestException('error.booking.serviceNameRequired');
    assertClean({ nom, description });

    const seats = await this.seatIds(merchantId);
    const created = await this.prisma.bookableService.create({
      data: {
        merchantId,
        templateId: dto.templateId ?? null,
        nom,
        description,
        durationMin: dto.durationMin,
        bufferMin: dto.bufferMin ?? 0,
        priceFrom: dto.priceFrom ?? null,
        isActive: dto.isActive ?? true,
        order: count,
        resources: { create: seats.map((resourceId) => ({ resourceId })) },
      },
    });
    return (await this.listServices(merchantId)).find((s) => s.id === created.id);
  }

  async updateService(merchantId: string, serviceId: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.bookableService.findFirst({ where: { id: serviceId, merchantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('error.booking.serviceNotFound');
    assertClean({ nom: dto.nom, description: dto.description });

    // `!= null` where the column is NOT NULL (@IsOptional() lets null through);
    // description and priceFrom accept null to clear them.
    await this.prisma.bookableService.update({
      where: { id: serviceId },
      data: {
        ...(dto.nom != null && { nom: dto.nom.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.durationMin != null && { durationMin: dto.durationMin }),
        ...(dto.bufferMin != null && { bufferMin: dto.bufferMin }),
        ...(dto.priceFrom !== undefined && { priceFrom: dto.priceFrom }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.order != null && { order: dto.order }),
      },
    });
    return (await this.listServices(merchantId)).find((s) => s.id === serviceId);
  }

  /** Soft delete: past bookings keep pointing at it. Upcoming bookings are kept. */
  async deleteService(merchantId: string, serviceId: string) {
    const { count } = await this.prisma.bookableService.updateMany({
      where: { id: serviceId, merchantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (!count) throw new NotFoundException('error.booking.serviceNotFound');
    return { ok: true };
  }

  // ── Hours ───────────────────────────────────────────────────

  /** Hours of the calendar; an empty list makes it follow the opening hours again. */
  async setHours(merchantId: string, ranges: HourRangeDto[]) {
    assertValidRanges(ranges);
    const seats = await this.seatIds(merchantId);
    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { resourceId: { in: seats } } }),
      this.prisma.workingHours.createMany({
        data: seats.flatMap((resourceId) => ranges.map((x) => ({ resourceId, weekday: x.weekday, startMin: x.startMin, endMin: x.endMin }))),
      }),
    ]);
    return { hours: await this.calendarHours(seats[0]) };
  }

  // ── Exceptions (holidays, closures) ─────────────────────────

  async createException(merchantId: string, dto: CreateExceptionDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(endsAt > startsAt)) throw new BadRequestException('error.booking.closureEndBeforeStart');
    if (endsAt.getTime() - startsAt.getTime() > 366 * 86_400_000) throw new BadRequestException('error.booking.closureTooLong');
    if (dto.reason) assertClean({ reason: dto.reason });
    const exception = await this.prisma.availabilityException.create({
      data: {
        merchantId,
        type: dto.type ?? 'CLOSED',
        startsAt,
        endsAt,
        reason: dto.reason?.trim() || null,
      },
    });
    // Existing bookings are kept: the app tells the merchant which ones fall in the closure.
    const affected = exception.type === 'CLOSED'
      ? await this.prisma.booking.count({
          where: {
            merchantId,
            status: { in: ACTIVE_BOOKING_STATUSES },
            startsAt: { gt: new Date(startsAt.getTime() - MAX_BOOKING_SPAN_MS), lt: endsAt },
            endsAt: { gt: startsAt },
          },
        })
      : 0;
    return { exception, affectedBookings: affected };
  }

  async deleteException(merchantId: string, id: string) {
    const { count } = await this.prisma.availabilityException.deleteMany({ where: { id, merchantId } });
    if (!count) throw new NotFoundException('error.booking.closureNotFound');
    return { ok: true };
  }

  // ── Agenda and bookings ─────────────────────────────────────

  async agenda(merchantId: string, q: AgendaQueryDto) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!(to > from)) throw new BadRequestException('error.booking.invalidPeriod');
    if (to.getTime() - from.getTime() > MAX_AGENDA_DAYS * 86_400_000) {
      throw new BadRequestException('error.booking.periodTooLong');
    }
    const [merchant, bookings, exceptions] = await Promise.all([
      this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { countryCode: true } }),
      this.prisma.booking.findMany({
        where: {
          merchantId,
          startsAt: { gt: new Date(from.getTime() - MAX_BOOKING_SPAN_MS), lt: to },
          endsAt: { gt: from },
          status: { notIn: ['EXPIRED', 'DECLINED'] },
        },
        orderBy: { startsAt: 'asc' },
        take: 2000,
        include: merchantViewInclude(merchantId),
      }),
      this.prisma.availabilityException.findMany({
        where: { merchantId, startsAt: { lt: to }, endsAt: { gt: from } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return {
      timeZone: timeZoneForCountry(merchant?.countryCode),
      bookings: bookings.map((b) => this.mapMerchantView(b)),
      exceptions,
    };
  }

  async pending(merchantId: string) {
    const rows = await this.prisma.booking.findMany({
      where: { merchantId, status: 'PENDING', startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 100,
      include: merchantViewInclude(merchantId),
    });
    return rows.map((b) => this.mapMerchantView(b));
  }

  /** A booking taken by phone or at the counter. Hours are not enforced, overlaps are. */
  async createBooking(merchantId: string, dto: MerchantCreateBookingDto) {
    const startsAt = new Date(dto.startsAt);
    const service = await this.prisma.bookableService.findFirst({ where: { id: dto.serviceId, merchantId, deletedAt: null } });
    if (!service) throw new NotFoundException('error.booking.serviceNotFound');
    const seats = await this.seatIds(merchantId);
    if (dto.clientId) {
      const card = await this.prisma.loyaltyCard.findUnique({
        where: { clientId_merchantId: { clientId: dto.clientId, merchantId } },
      });
      if (!card || card.deactivatedAt) throw new NotFoundException('error.booking.clientNotInFile');
    } else if (!dto.clientName?.trim()) {
      throw new BadRequestException('error.booking.clientNameRequired');
    }
    if (dto.clientName) assertClean({ clientName: dto.clientName });

    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
    const blockedUntil = new Date(endsAt.getTime() + service.bufferMin * 60_000);
    const booking = await this.writeIfFree(seats, startsAt, blockedUntil, (tx, resourceId) =>
      tx.booking.create({
        data: {
          merchantId,
          serviceId: service.id,
          resourceId,
          clientId: dto.clientId ?? null,
          clientName: dto.clientName?.trim() || null,
          clientPhone: dto.clientPhone?.trim() || null,
          startsAt,
          endsAt,
          blockedUntil,
          status: 'CONFIRMED',
          source: 'MERCHANT',
          note: dto.note?.trim() || null,
          serviceNameSnapshot: service.nom,
          priceSnapshot: service.priceFrom,
          confirmedAt: new Date(),
        },
      }),
    );
    this.notify.changed(booking, 'created');
    // A past booking typed in afterwards is a record, not news for the client.
    if (booking.clientId && startsAt > new Date()) void this.notify.toClient(booking, 'confirmed');
    return this.getOne(merchantId, booking.id);
  }

  async setStatus(merchantId: string, bookingId: string, action: MerchantBookingAction, reason?: string) {
    const rule = TRANSITIONS[action];
    if (!rule) throw new BadRequestException('error.booking.unknownAction');
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, merchantId } });
    if (!booking) throw new NotFoundException('error.booking.notFound');
    if (!rule.from.includes(booking.status)) {
      throw new ConflictException('error.booking.badTransition');
    }
    const now = new Date();
    if (action === 'confirm' && booking.startsAt <= now) throw new ConflictException('error.booking.alreadyPast');
    if (action === 'no-show' && booking.startsAt > now) throw new ConflictException('error.booking.notStartedYet');

    // A decline or cancellation keeps the merchant's reason: stored, and sent to the client.
    const ends = rule.to === 'CANCELLED_MERCHANT' || rule.to === 'DECLINED';
    const cancelReason = ends ? reason?.trim() || null : booking.cancelReason;
    if (ends && cancelReason) assertClean({ cancelReason });
    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: booking.status },
      data: {
        status: rule.to,
        ...(rule.to === 'CONFIRMED' && { confirmedAt: now }),
        ...(rule.to === 'CHECKED_IN' && { checkedInAt: now }),
        ...(ends && { cancelledAt: now, cancelReason }),
      },
    });
    if (!count) throw new ConflictException('error.booking.changed');

    const updated = { ...booking, status: rule.to, cancelReason };
    this.notify.changed(updated, 'status');
    if (rule.to === 'CONFIRMED') void this.notify.toClient(updated, 'confirmed');
    if (rule.to === 'DECLINED') void this.notify.toClient(updated, 'declined');
    if (rule.to === 'CANCELLED_MERCHANT') void this.notify.toClient(updated, 'cancelled');
    return this.getOne(merchantId, bookingId);
  }

  /**
   * Moves an upcoming booking to another start, same duration and buffer.
   * Like a counter booking, the hours are not enforced, overlaps are. A pending
   * request the merchant moves is answered by the move itself: it is confirmed.
   * The client is told, and the reminders start over for the new time.
   */
  async reschedule(merchantId: string, bookingId: string, dto: RescheduleBookingDto) {
    const startsAt = new Date(dto.startsAt);
    const now = new Date();
    if (startsAt <= now) throw new BadRequestException('error.booking.pickFutureTime');
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, merchantId } });
    if (!booking) throw new NotFoundException('error.booking.notFound');
    if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
      throw new ConflictException('error.booking.notMovable');
    }
    if (startsAt.getTime() === booking.startsAt.getTime()) return this.getOne(merchantId, bookingId);

    const shift = startsAt.getTime() - booking.startsAt.getTime();
    const endsAt = new Date(booking.endsAt.getTime() + shift);
    const blockedUntil = new Date(booking.blockedUntil.getTime() + shift);
    // Its own seat first, so a move inside a free stretch keeps the same seat.
    const seats = await this.seatIds(merchantId);
    const candidates = [booking.resourceId, ...seats.filter((id) => id !== booking.resourceId)];
    const { count } = await this.writeIfFree(
      candidates,
      startsAt,
      blockedUntil,
      (tx, resourceId) =>
        tx.booking.updateMany({
          where: { id: booking.id, status: booking.status, startsAt: booking.startsAt },
          data: {
            resourceId,
            startsAt,
            endsAt,
            blockedUntil,
            status: 'CONFIRMED',
            ...(booking.status === 'PENDING' && { confirmedAt: now }),
            ...remindersAfterMove(startsAt, now),
            pendingReminderSentAt: null,
          },
        }),
      booking.id,
    );
    if (!count) throw new ConflictException('error.booking.changed');

    const updated = { ...booking, startsAt, status: 'CONFIRMED' as const };
    this.notify.changed(updated, 'status');
    if (updated.clientId) void this.notify.toClient(updated, 'rescheduled');
    return this.getOne(merchantId, bookingId);
  }

  /**
   * Called after a stamp transaction made outside a booking (scan, phone
   * search): the client's visit around now, if it has no stamps yet, gets this
   * transaction, and is checked in when it was only confirmed. Stamps are
   * often given on payment, so a visit that started hours ago still counts.
   * Never throws — a failure must not affect the stamp itself.
   */
  async checkInFromTransaction(merchantId: string, clientId: string, transactionId: string): Promise<void> {
    try {
      const now = Date.now();
      const booking = await this.prisma.booking.findFirst({
        where: {
          merchantId,
          clientId,
          status: { in: CREDITABLE_BOOKING_STATUSES },
          checkInTransactionId: null,
          startsAt: { gt: new Date(now - CHECKIN_WINDOW_MS - MAX_BOOKING_SPAN_MS), lte: new Date(now + CHECKIN_WINDOW_MS) },
          endsAt: { gte: new Date(now - CHECKIN_WINDOW_MS) },
        },
        orderBy: { startsAt: 'asc' },
        select: VISIT_BOOKING_SELECT,
      });
      if (!booking) return;
      const linked = await attachVisitTransaction(this.prisma, booking, transactionId);
      if (linked) this.announceVisit(linked);
    } catch (e) {
      this.logger.warn(`booking check-in from transaction failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** A booking just received its stamps: the agenda and the client's bookings refresh. */
  announceVisit(booking: VisitBooking): void {
    this.notify.changed(booking, 'status');
  }

  /**
   * Runs `write` in a Serializable transaction (retried on serialization
   * failures) on the first seat of `resourceIds` where [startsAt, blockedUntil)
   * is free, `ignoreId` aside. No free seat, or an overlap caught by the
   * database constraint, is a 409.
   */
  private async writeIfFree<T>(
    resourceIds: string[],
    startsAt: Date,
    blockedUntil: Date,
    write: (tx: Prisma.TransactionClient, resourceId: string) => Promise<T>,
    ignoreId?: string,
  ): Promise<T> {
    try {
      return await withRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            for (const resourceId of resourceIds) {
              if (!(await this.availability.overlaps(tx, resourceId, startsAt, blockedUntil, ignoreId))) {
                return write(tx, resourceId);
              }
            }
            throw new ConflictException('error.booking.overlap');
          },
          { isolationLevel: 'Serializable' },
        ),
      );
    } catch (err) {
      if (isOverlapViolation(err)) throw new ConflictException('error.booking.overlap');
      throw err;
    }
  }

  async getOne(merchantId: string, bookingId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, merchantId },
      include: merchantViewInclude(merchantId),
    });
    if (!b) throw new NotFoundException('error.booking.notFound');
    return this.mapMerchantView(b);
  }

  private mapMerchantView(b: MerchantViewBooking) {
    // Same rule as the client list: a card the merchant created by phone hides the
    // client's details until the client accepts it (consentPending).
    const consentPending = b.client?.loyaltyCards.some((c) => c.consentPending) ?? false;
    const share = !consentPending && (b.client?.shareInfoMerchants ?? false);
    return {
      id: b.id,
      status: b.status,
      source: b.source,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      blockedUntil: b.blockedUntil.toISOString(),
      serviceId: b.serviceId,
      serviceName: b.serviceNameSnapshot,
      price: b.priceSnapshot === null ? null : Number(b.priceSnapshot),
      note: b.note,
      client: b.client
        ? {
            id: b.client.id,
            prenom: consentPending ? maskName(b.client.prenom) : b.client.prenom,
            nom: share ? b.client.nom : null,
            telephone: share ? b.client.telephone : null,
            member: b.client.loyaltyCards.length > 0,
          }
        : null,
      stampsGiven: b.checkInTransactionId !== null,
      clientName: b.clientName,
      clientPhone: b.clientPhone,
      cancelReason: b.cancelReason,
      createdAt: b.createdAt.toISOString(),
    };
  }
}
