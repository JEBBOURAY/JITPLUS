import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOOKABLE_SERVICE_WHERE } from '../common/prisma-selects';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingNotifyService } from './booking-notify.service';
import { addDaysYmd, timeZoneForCountry, zonedParts } from './booking-time';
import {
  ACTIVE_BOOKING_STATUSES,
  DEFAULT_SETTINGS,
  MAX_BOOKING_SPAN_MS,
  MAX_UPCOMING_PER_CLIENT,
  clientCanCancel,
  isOverlapViolation,
} from './booking.constants';
import { ClientCreateBookingDto } from './dto';
import { haversineKm } from '../deals/morocco-cities';

/** Error keys: AllExceptionsFilter translates them and returns the key as a stable `code`. */
const BOOKING_ERRORS = {
  slotTaken: 'error.booking.slotTaken',
  maxUpcoming: 'error.booking.maxUpcoming',
  verifyAccount: 'error.booking.verifyAccount',
  notCancellable: 'error.booking.notCancellable',
  cancelTooLate: 'error.booking.cancelTooLate',
  changed: 'error.booking.changed',
  notFound: 'error.booking.notFound',
  merchantNotFound: 'error.booking.merchantNotFound',
  invalidDate: 'error.booking.invalidDate',
} as const;
const SLOT_TAKEN = BOOKING_ERRORS.slotTaken;

/** Safety cap on the shops scanned by the booking search. */
const SEARCH_MAX_MERCHANTS = 300;
/** Shops returned by the booking search, after sorting. */
const SEARCH_RESULTS = 60;

export interface BookingSearchShop {
  merchantId: string;
  nom: string;
  logoUrl: string | null;
  categorie: string;
  ville: string | null;
  currency: string;
  /** Nearest active store, when the client shared a position. */
  distanceKm: number | null;
  hasCard: boolean;
  services: { id: string; nom: string; templateNom: string | null; durationMin: number; priceFrom: number | null }[];
}

@Injectable()
export class BookingClientService {
  private readonly logger = new Logger(BookingClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: BookingAvailabilityService,
    private readonly notify: BookingNotifyService,
    private readonly plan: MerchantPlanService,
  ) {}

  /** What the merchant page shows: is booking on, and its services. */
  async merchantOffer(merchantId: string) {
    const ctx = await this.availability.context(merchantId, false);
    if (!ctx.settings.enabled) return { enabled: false, services: [] };
    const services = await this.prisma.bookableService.findMany({
      where: { merchantId, ...BOOKABLE_SERVICE_WHERE },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, nom: true, description: true, durationMin: true, priceFrom: true,
      },
    });
    return {
      enabled: true,
      currency: ctx.merchant.currency,
      timeZone: ctx.tz,
      maxAdvanceDays: ctx.settings.maxAdvanceDays,
      cancelDeadlineHours: ctx.settings.cancelDeadlineHours,
      // The recap says "Envoyer la demande" instead of "Confirmer" when the shop approves each request.
      autoConfirm: ctx.settings.autoConfirm,
      services: services.map((s) => ({
        id: s.id,
        nom: s.nom,
        description: s.description,
        durationMin: s.durationMin,
        priceFrom: s.priceFrom === null ? null : Number(s.priceFrom),
      })),
    };
  }

  /**
   * Shops taking bookings and their services, for the "Rendez-vous" tab: the
   * client's own shops (with a card) first, then the nearest. The app filters by
   * service on this list, so a search is instant.
   */
  async searchServices(pos: { lat: number; lng: number } | null, clientId?: string): Promise<{ shops: BookingSearchShop[] }> {
    const [merchants, cards, blocks] = await Promise.all([
      this.prisma.merchant.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          stores: { some: { isActive: true } },
          bookingSettings: { is: { enabled: true } },
          bookableServices: { some: BOOKABLE_SERVICE_WHERE },
        },
        select: {
          id: true, nom: true, logoUrl: true, categorie: true, ville: true, currency: true,
          stores: { where: { isActive: true }, select: { latitude: true, longitude: true } },
          bookableServices: {
            where: BOOKABLE_SERVICE_WHERE,
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, nom: true, durationMin: true, priceFrom: true, template: { select: { nom: true } } },
          },
        },
        orderBy: { id: 'asc' },
        take: SEARCH_MAX_MERCHANTS,
      }),
      clientId
        ? this.prisma.loyaltyCard.findMany({ where: { clientId, deactivatedAt: null }, select: { merchantId: true } })
        : Promise.resolve([]),
      clientId
        ? this.prisma.clientMerchantBlock.findMany({ where: { clientId }, select: { merchantId: true } })
        : Promise.resolve([]),
    ]);
    const carded = new Set(cards.map((c) => c.merchantId));
    const blocked = new Set(blocks.map((b) => b.merchantId));

    const shops: BookingSearchShop[] = merchants
      .filter((m) => !blocked.has(m.id))
      .map((m) => {
        let distanceKm: number | null = null;
        if (pos) {
          for (const s of m.stores) {
            if (s.latitude == null || s.longitude == null) continue;
            const km = haversineKm(pos.lat, pos.lng, s.latitude, s.longitude);
            if (distanceKm === null || km < distanceKm) distanceKm = km;
          }
        }
        return {
          merchantId: m.id,
          nom: m.nom,
          logoUrl: m.logoUrl,
          categorie: m.categorie,
          ville: m.ville,
          currency: m.currency,
          distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
          hasCard: carded.has(m.id),
          services: m.bookableServices.map((s) => ({
            id: s.id,
            nom: s.nom,
            templateNom: s.template?.nom ?? null,
            durationMin: s.durationMin,
            priceFrom: s.priceFrom === null ? null : Number(s.priceFrom),
          })),
        };
      });

    // Own shops first, then nearest (unknown distance last), then by name.
    shops.sort((a, b) =>
      Number(b.hasCard) - Number(a.hasCard)
      || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
      || a.nom.localeCompare(b.nom));
    return { shops: shops.slice(0, SEARCH_RESULTS) };
  }

  async availabilityForDay(merchantId: string, serviceId: string, ymd: string) {
    const ctx = await this.availability.context(merchantId, true);
    const service = await this.availability.service(merchantId, serviceId);
    const slots = await this.availability.slotsForDay(ctx, service, ymd);
    return {
      date: ymd,
      timeZone: ctx.tz,
      slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
    };
  }

  /** Days of the bookable window (today included) with at least one free slot for the service. */
  async availableDays(merchantId: string, serviceId: string) {
    const ctx = await this.availability.context(merchantId, true);
    const service = await this.availability.service(merchantId, serviceId);
    const { first, last } = this.availability.bookableWindow(ctx);
    const ymds: string[] = [];
    for (let d = first; d <= last; d = addDaysYmd(d, 1)) ymds.push(d);
    const slots = await this.availability.slotsForDays(ctx, service, ymds);
    return { timeZone: ctx.tz, days: ymds.filter((d) => (slots.get(d)?.length ?? 0) > 0) };
  }

  async create(clientId: string, merchantId: string, dto: ClientCreateBookingDto) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({
        where: { clientId_idempotencyKey: { clientId, idempotencyKey: dto.idempotencyKey } },
      });
      if (existing) {
        // A key replays only the request it was made for, never another merchant's or slot's booking.
        const same =
          existing.merchantId === merchantId &&
          existing.serviceId === dto.serviceId &&
          existing.startsAt.getTime() === new Date(dto.startsAt).getTime();
        if (!same) throw new ConflictException(BOOKING_ERRORS.changed);
        return this.toClientView(existing.id, clientId);
      }
    }

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException(BOOKING_ERRORS.invalidDate);

    const ctx = await this.availability.context(merchantId, true);
    const service = await this.availability.service(merchantId, dto.serviceId);

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true, telephoneVerified: true, emailVerified: true, googleId: true, appleId: true, isAnonymous: true },
    });
    if (!client) throw new NotFoundException(BOOKING_ERRORS.notFound);
    // A verified contact (or a Google / Apple sign-in) keeps throwaway accounts from blocking slots.
    if (client.isAnonymous || (!client.telephoneVerified && !client.emailVerified && !client.googleId && !client.appleId)) {
      throw new ForbiddenException(BOOKING_ERRORS.verifyAccount);
    }
    // Same rule as joinMerchant: a merchant the client blocked does not exist for
    // them. Booking would otherwise reactivate the card (ensureLoyaltyCard) and
    // re-enrol them while the block is still in place.
    const blocked = await this.prisma.clientMerchantBlock.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true },
    });
    if (blocked) throw new NotFoundException(BOOKING_ERRORS.merchantNotFound);

    const now = new Date();
    // Upcoming active bookings of this client here; counted again inside the
    // transaction so that parallel requests cannot pass the limit together.
    const upcomingWhere: Prisma.BookingWhereInput = {
      clientId,
      merchantId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      startsAt: { gt: new Date(now.getTime() - MAX_BOOKING_SPAN_MS) },
      blockedUntil: { gt: now },
    };
    const [upcoming, noShows] = await Promise.all([
      this.prisma.booking.count({ where: upcomingWhere }),
      this.prisma.booking.count({ where: { clientId, merchantId, status: 'NO_SHOW' } }),
    ]);
    if (upcoming >= MAX_UPCOMING_PER_CLIENT) {
      throw new ConflictException(BOOKING_ERRORS.maxUpcoming);
    }

    // The requested start must be one of the slots offered for that day.
    const ymd = zonedParts(ctx.tz, startsAt).ymd;
    const slots = await this.availability.slotsForDay(ctx, service, ymd, { now });
    const slot = slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot) throw new ConflictException(SLOT_TAKEN);

    const needsApproval = !ctx.settings.autoConfirm || noShows >= ctx.settings.noShowLimit;
    const status: BookingStatus = needsApproval ? 'PENDING' : 'CONFIRMED';
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
    const blockedUntil = new Date(endsAt.getTime() + service.bufferMin * 60_000);

    let booking;
    try {
      booking = await withRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            if ((await tx.booking.count({ where: upcomingWhere })) >= MAX_UPCOMING_PER_CLIENT) {
              throw new ConflictException(BOOKING_ERRORS.maxUpcoming);
            }
            // Checked again inside the transaction: the slot may have just been taken.
            let resourceId: string | null = null;
            for (const id of slot.resourceIds) {
              if (!(await this.availability.overlaps(tx, id, startsAt, blockedUntil))) {
                resourceId = id;
                break;
              }
            }
            if (!resourceId) throw new ConflictException(SLOT_TAKEN);

            return tx.booking.create({
              data: {
                merchantId,
                serviceId: service.id,
                resourceId,
                clientId,
                startsAt,
                endsAt,
                blockedUntil,
                status,
                source: 'APP',
                note: dto.note?.trim() || null,
                serviceNameSnapshot: service.nom,
                priceSnapshot: service.priceFrom,
                idempotencyKey: dto.idempotencyKey ?? null,
                confirmedAt: status === 'CONFIRMED' ? now : null,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        ),
      );
    } catch (err) {
      if (isOverlapViolation(err)) throw new ConflictException(SLOT_TAKEN);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.prisma.booking.findUnique({
          where: { clientId_idempotencyKey: { clientId, idempotencyKey: dto.idempotencyKey } },
        });
        if (existing) return this.toClientView(existing.id, clientId);
      }
      throw err;
    }

    await this.ensureLoyaltyCard(clientId, merchantId);
    this.notify.changed(booking, 'created');
    void this.notify.toMerchant(booking, status === 'CONFIRMED' ? 'newConfirmed' : 'newPending');
    void this.notify.toClient(booking, status === 'CONFIRMED' ? 'confirmed' : 'pending');
    return this.toClientView(booking.id, clientId);
  }

  /**
   * A booking makes the client a member of the merchant's loyalty program,
   * under the same rules as joining from the merchant page (FREE plan client
   * limit included). Best-effort: the booking stands even without a card.
   */
  private async ensureLoyaltyCard(clientId: string, merchantId: string): Promise<void> {
    try {
      const existing = await this.prisma.loyaltyCard.findUnique({
        where: { clientId_merchantId: { clientId, merchantId } },
        select: { id: true, deactivatedAt: true, consentPending: true },
      });
      if (existing && !existing.deactivatedAt) {
        // Booking is the client's own action: it confirms a phone-opened card.
        if (existing.consentPending) {
          await this.prisma.loyaltyCard.update({ where: { id: existing.id }, data: { consentPending: false } });
        }
        return;
      }
      const { plan } = await this.plan.resolveEffectivePlan(merchantId);
      await this.prisma.$transaction(async (tx) => {
        await this.plan.assertCanAddClient(merchantId, { tx, plan });
        await tx.loyaltyCard.upsert({
          where: { clientId_merchantId: { clientId, merchantId } },
          create: { clientId, merchantId, stamps: 0 },
          update: { deactivatedAt: null, consentPending: false },
        });
      });
    } catch (e) {
      this.logger.log(`booking: no loyalty card for client at ${merchantId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async get(clientId: string, bookingId: string) {
    return this.toClientView(bookingId, clientId);
  }

  async list(clientId: string, scope: 'upcoming' | 'past' = 'upcoming') {
    const now = new Date();
    const upcoming = scope === 'upcoming';
    const rows = await this.prisma.booking.findMany({
      where: upcoming
        ? {
            clientId,
            status: { in: ACTIVE_BOOKING_STATUSES },
            startsAt: { gt: new Date(now.getTime() - MAX_BOOKING_SPAN_MS) },
            blockedUntil: { gt: now },
          }
        : { clientId, OR: [{ status: { notIn: ACTIVE_BOOKING_STATUSES } }, { blockedUntil: { lte: now } }] },
      orderBy: { startsAt: upcoming ? 'asc' : 'desc' },
      take: upcoming ? 50 : 100,
      select: CLIENT_VIEW_SELECT,
    });
    const stamps = await this.stampsEarned(rows);
    return rows.map((r) => this.mapView(r, stamps));
  }

  async cancel(clientId: string, bookingId: string, reason?: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, clientId },
      include: { merchant: { select: { bookingSettings: { select: { cancelDeadlineHours: true } } } } },
    });
    if (!booking) throw new NotFoundException(BOOKING_ERRORS.notFound);
    if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
      throw new ConflictException(BOOKING_ERRORS.notCancellable);
    }
    const deadlineH = booking.merchant.bookingSettings?.cancelDeadlineHours ?? DEFAULT_SETTINGS.cancelDeadlineHours;
    if (!clientCanCancel(booking, deadlineH)) throw new BadRequestException(BOOKING_ERRORS.cancelTooLate);
    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: booking.status },
      data: { status: 'CANCELLED_CLIENT', cancelledAt: new Date(), cancelReason: reason?.trim() || null },
    });
    if (!count) throw new ConflictException(BOOKING_ERRORS.changed);
    const updated = { ...booking, status: 'CANCELLED_CLIENT' as const };
    this.notify.changed(updated, 'status');
    void this.notify.toMerchant(updated, 'cancelledByClient');
    return this.toClientView(bookingId, clientId);
  }

  private async toClientView(bookingId: string, clientId: string) {
    const row = await this.prisma.booking.findFirst({ where: { id: bookingId, clientId }, select: CLIENT_VIEW_SELECT });
    if (!row) throw new NotFoundException(BOOKING_ERRORS.notFound);
    return this.mapView(row, await this.stampsEarned([row]));
  }

  /** Stamps each visit earned, by transaction id: one query for the whole list. */
  private async stampsEarned(rows: ClientViewRow[]): Promise<Map<string, number>> {
    const ids = rows.flatMap((r) => r.checkInTransactionId ?? []);
    if (!ids.length) return new Map();
    const transactions = await this.prisma.transaction.findMany({
      where: { id: { in: ids }, type: 'EARN_STAMPS', status: 'ACTIVE' },
      select: { id: true, stamps: true },
    });
    return new Map(transactions.map((t) => [t.id, t.stamps]));
  }

  private mapView(r: ClientViewRow, stamps: Map<string, number>) {
    const deadlineH = r.merchant.bookingSettings?.cancelDeadlineHours ?? DEFAULT_SETTINGS.cancelDeadlineHours;
    const cancellable = clientCanCancel(r, deadlineH);
    const { bookingSettings: _s, countryCode, ...merchant } = r.merchant;
    return {
      id: r.id,
      status: r.status,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      serviceId: r.serviceId,
      serviceName: r.serviceNameSnapshot,
      price: r.priceSnapshot === null ? null : Number(r.priceSnapshot),
      note: r.note,
      cancelReason: r.cancelReason,
      merchant,
      /** IANA zone of the merchant, to show local times */
      timeZone: timeZoneForCountry(countryCode),
      cancelDeadlineHours: deadlineH,
      cancellable,
      /** Stamps this visit earned, 0 when none */
      stampsEarned: (r.checkInTransactionId && stamps.get(r.checkInTransactionId)) || 0,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

const CLIENT_VIEW_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  serviceId: true,
  serviceNameSnapshot: true,
  priceSnapshot: true,
  note: true,
  cancelReason: true,
  createdAt: true,
  checkInTransactionId: true,
  merchant: {
    select: {
      id: true, nom: true, logoUrl: true, adresse: true, ville: true, phoneNumber: true,
      latitude: true, longitude: true, currency: true, countryCode: true,
      bookingSettings: { select: { cancelDeadlineHours: true } },
    },
  },
} satisfies Prisma.BookingSelect;
type ClientViewRow = Prisma.BookingGetPayload<{ select: typeof CLIENT_VIEW_SELECT }>;
