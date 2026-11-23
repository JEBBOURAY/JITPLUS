/**
 * Booking against a real PostgreSQL (exclusion constraint, Serializable
 * retries, concurrency). Skipped unless BOOKING_IT_DATABASE_URL points at a
 * THROWAWAY database with every migration applied:
 *
 *   BOOKING_IT_DATABASE_URL=postgresql://…/jit_booking_test npx jest booking.integration
 */
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingClientService } from './booking-client.service';
import { BookingMerchantService } from './booking-merchant.service';
import { creditBookingVisitInTx } from './booking-visit';
import { BookingTasksService } from './booking-tasks.service';
import { BookingNotifyService } from './booking-notify.service';
import { BookingAdminService } from './booking-admin';
import { ClientClosureService } from '../client-auth/client-closure.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { ForbiddenException } from '@nestjs/common';
import { addDaysYmd, isoWeekdayOfYmd, wallTimeToUtc, zonedParts } from './booking-time';

const url = process.env.BOOKING_IT_DATABASE_URL;
const run = url ? describe : describe.skip;
const TZ = 'Africa/Casablanca';

run('booking (integration)', () => {
  let prisma: PrismaService;
  let client: BookingClientService;
  let merchantSvc: BookingMerchantService;
  let tasks: BookingTasksService;
  let notify: { changed: jest.Mock; toClient: jest.Mock; toMerchant: jest.Mock };
  const plan = { resolveEffectivePlan: jest.fn().mockResolvedValue({ plan: 'FREE' }), assertCanAddClient: jest.fn().mockResolvedValue(undefined) };
  let merchantId: string;
  let serviceId: string;
  let resourceId: string;
  const clients: string[] = [];
  let monday: string;
  const at = (hhmm: string, ymd = monday) => {
    const [h, m] = hhmm.split(':').map(Number);
    return wallTimeToUtc(TZ, ymd, h * 60 + m);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ENABLE_CRONS = 'true';
    prisma = new PrismaService();
    await prisma.$connect();
    notify = { changed: jest.fn(), toClient: jest.fn().mockResolvedValue(undefined), toMerchant: jest.fn().mockResolvedValue(undefined) };
    const availability = new BookingAvailabilityService(prisma);
    client = new BookingClientService(prisma, availability, notify as unknown as BookingNotifyService, plan as unknown as MerchantPlanService);
    merchantSvc = new BookingMerchantService(prisma, availability, notify as unknown as BookingNotifyService);
    tasks = new BookingTasksService(prisma, notify as unknown as BookingNotifyService);

    // A Monday 3 to 9 days ahead, Morocco time.
    let d = addDaysYmd(zonedParts(TZ, new Date()).ymd, 3);
    while (isoWeekdayOfYmd(d) !== 1) d = addDaysYmd(d, 1);
    monday = d;

    const tag = randomUUID().slice(0, 8);
    const m = await prisma.merchant.create({
      data: {
        nom: `Salon IT ${tag}`,
        email: `salon-${tag}@example.test`,
        password: 'x',
        categorie: 'COIFFURE',
        openingHours: { mon: { slots: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] } },
      },
    });
    merchantId = m.id;
    for (let i = 0; i < 6; i++) {
      const c = await prisma.client.create({
        data: { prenom: `Client${i}`, telephone: `+2126${tag.replace(/\D/g, '0').slice(0, 4)}${i}${i}${i}${i}`, telephoneVerified: true },
      });
      clients.push(c.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.booking.deleteMany({ where: { merchantId } });
    await prisma.transaction.deleteMany({ where: { merchantId } });
    await prisma.loyaltyCard.deleteMany({ where: { merchantId } });
    await prisma.client.deleteMany({ where: { id: { in: clients } } });
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('setup creates one calendar following the fiche hours, and the catalogue of the category', async () => {
    // Two first calls at once (screen opened twice) still create a single owner.
    const [setup] = await Promise.all([merchantSvc.setup(merchantId), merchantSvc.setup(merchantId)]);
    expect(await prisma.bookingResource.count({ where: { merchantId } })).toBe(1);
    resourceId = (await prisma.bookingResource.findFirstOrThrow({ where: { merchantId } })).id;
    expect(setup.timeZone).toBe(TZ);
    expect(setup.hours).toEqual([]);
    expect(setup.openingHours).toEqual([
      { weekday: 1, startMin: 540, endMin: 720 },
      { weekday: 1, startMin: 840, endMin: 1080 },
    ]);
    expect(setup.templates.map((t) => t.nom)).toContain('Coupe femme');
    expect(setup.settings.enabled).toBe(false);
  });

  it('booking hours replace the opening hours, and clearing them restores those', async () => {
    const { hours } = await merchantSvc.setHours(merchantId, [{ weekday: 2, startMin: 600, endMin: 660 }]);
    expect(hours).toEqual([{ weekday: 2, startMin: 600, endMin: 660 }]);
    expect((await merchantSvc.setHours(merchantId, [])).hours).toEqual([]);
  });

  it('refuses to enable booking before a service exists', async () => {
    await expect(merchantSvc.updateSettings(merchantId, { enabled: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a catalogue service and a custom one, durations set by the merchant', async () => {
    const tpl = await prisma.serviceTemplate.findFirstOrThrow({ where: { category: 'COIFFURE', nom: 'Coupe femme' } });
    const fromCatalogue = await merchantSvc.createService(merchantId, { templateId: tpl.id, durationMin: 45, priceFrom: 120 });
    expect(fromCatalogue).toMatchObject({ nom: 'Coupe femme', durationMin: 45, isCustom: false });

    const custom = await merchantSvc.createService(merchantId, { nom: 'Coupe + soin argan', durationMin: 60, bufferMin: 15 });
    expect(custom).toMatchObject({ isCustom: true, templateId: null, durationMin: 60, bufferMin: 15 });
    serviceId = fromCatalogue!.id;

    const settings = await merchantSvc.updateSettings(merchantId, { enabled: true });
    expect(settings.enabled).toBe(true);
  });

  it('offers slots on the step grid inside the hours', async () => {
    const offer = await client.merchantOffer(merchantId);
    expect(offer.services).toHaveLength(2);
    const day = await client.availabilityForDay(merchantId, serviceId, monday);
    const first = new Date(day.slots[0].startsAt);
    expect(first.toISOString()).toBe(at('09:00').toISOString());
    // 45 min must end by 12:00 → last morning start 11:15
    expect(day.slots.map((s) => s.startsAt)).toContain(at('11:15').toISOString());
    expect(day.slots.map((s) => s.startsAt)).not.toContain(at('11:30').toISOString());
  });

  it('books a slot, makes the client a loyalty member, and blocks the slot', async () => {
    const b = await client.create(clients[0], merchantId, { serviceId, startsAt: at('10:00').toISOString(), idempotencyKey: 'k1' });
    expect(b.status).toBe('CONFIRMED');
    expect(await prisma.loyaltyCard.count({ where: { merchantId, clientId: clients[0] } })).toBe(1);

    // Same key again = same booking, no duplicate
    const again = await client.create(clients[0], merchantId, { serviceId, startsAt: at('10:00').toISOString(), idempotencyKey: 'k1' });
    expect(again.id).toBe(b.id);

    await expect(
      client.create(clients[1], merchantId, { serviceId, startsAt: at('10:00').toISOString() }),
    ).rejects.toBeInstanceOf(ConflictException);
    const day = await client.availabilityForDay(merchantId, serviceId, monday);
    expect(day.slots.map((s) => s.startsAt)).not.toContain(at('10:30').toISOString());
  });

  it('refuses a booking at a merchant the client blocked, without re-enrolling them', async () => {
    const c = await prisma.client.create({ data: { prenom: 'Blocker', telephoneVerified: true } });
    clients.push(c.id);
    await prisma.clientMerchantBlock.create({ data: { clientId: c.id, merchantId } });
    await expect(
      client.create(c.id, merchantId, { serviceId, startsAt: at('11:00').toISOString() }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.loyaltyCard.count({ where: { merchantId, clientId: c.id } })).toBe(0);
    expect(await prisma.booking.count({ where: { merchantId, clientId: c.id } })).toBe(0);
  });

  it('lets only one of five simultaneous requests take the same slot', async () => {
    const results = await Promise.allSettled(
      clients.slice(1, 6).map((c) => client.create(c, merchantId, { serviceId, startsAt: at('15:00').toISOString() })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.booking.count({ where: { merchantId, startsAt: at('15:00'), status: 'CONFIRMED' } })).toBe(1);
  }, 60_000);

  it('the database itself refuses an overlap that skips the service checks', async () => {
    const svc = await prisma.bookableService.findUniqueOrThrow({ where: { id: serviceId } });
    await expect(
      prisma.booking.create({
        data: {
          merchantId, serviceId, resourceId, clientName: 'Direct', status: 'CONFIRMED',
          startsAt: at('10:15'), endsAt: at('10:30'), blockedUntil: at('10:30'),
          serviceNameSnapshot: svc.nom,
        },
      }),
    ).rejects.toThrow(/bookings_no_overlap/);
  });

  it('the merchant can add a phone booking outside the hours but not on top of another', async () => {
    const late = await merchantSvc.createBooking(merchantId, {
      serviceId, startsAt: at('19:00').toISOString(), clientName: 'Mme Alaoui',
    });
    expect(late).toMatchObject({ status: 'CONFIRMED', source: 'MERCHANT', clientName: 'Mme Alaoui' });
    await expect(
      merchantSvc.createBooking(merchantId, { serviceId, startsAt: at('19:30').toISOString(), clientName: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a cancelled booking frees its slot', async () => {
    const mine = await client.list(clients[0]);
    expect(mine[0]).toMatchObject({ status: 'CONFIRMED', cancellable: true });
    await client.cancel(clients[0], mine[0].id);
    const day = await client.availabilityForDay(merchantId, serviceId, monday);
    expect(day.slots.map((s) => s.startsAt)).toContain(at('10:00').toISOString());
  });

  it('a client over the no-show limit waits for approval; the merchant confirms', async () => {
    await prisma.bookingSettings.update({ where: { merchantId }, data: { noShowLimit: 1 } });
    const past = await merchantSvc.createBooking(merchantId, {
      serviceId, clientId: clients[0], startsAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    });
    // Typed in afterwards: no "confirmed" push for a past booking.
    expect(notify.toClient).not.toHaveBeenCalledWith(expect.objectContaining({ id: past.id }), 'confirmed');
    await merchantSvc.setStatus(merchantId, past.id, 'no-show');

    const req = await client.create(clients[0], merchantId, { serviceId, startsAt: at('16:00').toISOString() });
    expect(req.status).toBe('PENDING');
    const confirmed = await merchantSvc.setStatus(merchantId, req.id, 'confirm');
    expect(confirmed.status).toBe('CONFIRMED');
    await expect(merchantSvc.setStatus(merchantId, req.id, 'decline')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a stamp scan near the start checks the booking in', async () => {
    const soon = await merchantSvc.createBooking(merchantId, {
      serviceId, clientId: clients[0], startsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    await merchantSvc.checkInFromTransaction(merchantId, clients[0], randomUUID());
    const after = await merchantSvc.getOne(merchantId, soon.id);
    expect(after.status).toBe('CHECKED_IN');
  });

  it('stamps given from a booking are tied to it once, and the client sees them', async () => {
    const past = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
    const stamp = (clientId: string) =>
      prisma.transaction.create({ data: { clientId, merchantId, type: 'EARN_STAMPS', amount: 120, stamps: 2 } });
    const credit = (bookingId: string, clientId: string, transactionId: string, complete = false) =>
      prisma.$transaction((tx) => creditBookingVisitInTx(tx, { booking: { id: bookingId, complete }, merchantId, clientId, transactionId }));

    const visit = await merchantSvc.createBooking(merchantId, { serviceId, clientId: clients[0], startsAt: past(5) });
    expect(visit).toMatchObject({ stampsGiven: false, client: { member: true } });
    const tx = await stamp(clients[0]);

    // Another client's stamps never land on this booking.
    await expect(credit(visit.id, clients[1], tx.id)).rejects.toBeInstanceOf(NotFoundException);
    await credit(visit.id, clients[0], tx.id);
    expect(await merchantSvc.getOne(merchantId, visit.id)).toMatchObject({ status: 'CHECKED_IN', stampsGiven: true });
    expect(await client.get(clients[0], visit.id)).toMatchObject({ stampsEarned: 2 });
    expect((await client.list(clients[0], 'past')).find((b) => b.id === visit.id)?.stampsEarned).toBe(2);

    // A second credit is refused: one visit, one set of stamps.
    await expect(credit(visit.id, clients[0], (await stamp(clients[0])).id)).rejects.toBeInstanceOf(ConflictException);

    // "Terminer" answered by giving the stamps closes the booking.
    const closing = await merchantSvc.createBooking(merchantId, { serviceId, clientId: clients[0], startsAt: past(8) });
    await credit(closing.id, clients[0], (await stamp(clients[0])).id, true);
    expect(await merchantSvc.getOne(merchantId, closing.id)).toMatchObject({ status: 'COMPLETED', stampsGiven: true });

    // Not for a visit days ahead.
    const ahead = await merchantSvc.createBooking(merchantId, { serviceId, clientId: clients[0], startsAt: past(-50) });
    await expect(credit(ahead.id, clients[0], (await stamp(clients[0])).id)).rejects.toBeInstanceOf(ConflictException);
    await merchantSvc.setStatus(merchantId, ahead.id, 'cancel');
  });

  it('a scan on payment reaches a visit already marked arrived or closed', async () => {
    const started = await merchantSvc.createBooking(merchantId, {
      serviceId, clientId: clients[0], startsAt: new Date(Date.now() - 100 * 60_000).toISOString(),
    });
    await merchantSvc.setStatus(merchantId, started.id, 'complete');
    await merchantSvc.checkInFromTransaction(merchantId, clients[0], randomUUID());
    expect(await merchantSvc.getOne(merchantId, started.id)).toMatchObject({ status: 'COMPLETED', stampsGiven: true });
  });

  it('expires unanswered requests', async () => {
    await prisma.bookingSettings.update({ where: { merchantId }, data: { autoConfirm: false, noShowLimit: 3 } });
    const req = await client.create(clients[2], merchantId, { serviceId, startsAt: at('17:00').toISOString() });
    expect(req.status).toBe('PENDING');
    await prisma.booking.update({ where: { id: req.id }, data: { createdAt: new Date(Date.now() - 13 * 3_600_000) } });
    const n = await tasks.expirePending(new Date());
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await merchantSvc.getOne(merchantId, req.id)).status).toBe('EXPIRED');
    expect(notify.toClient).toHaveBeenCalledWith(expect.objectContaining({ id: req.id }), 'expired');
    expect(notify.toMerchant).toHaveBeenCalledWith(expect.objectContaining({ id: req.id }), 'requestExpired');
  });

  it('reminds the merchant once before an unanswered request expires', async () => {
    const req = await client.create(clients[4], merchantId, { serviceId, startsAt: at('11:00').toISOString() });
    expect(req.status).toBe('PENDING');
    // Made 11 h ago: it expires in 1 h, inside the 2 h reminder window.
    await prisma.booking.update({ where: { id: req.id }, data: { createdAt: new Date(Date.now() - 11 * 3_600_000) } });
    expect(await tasks.remindPending(new Date())).toBeGreaterThanOrEqual(1);
    expect(notify.toMerchant).toHaveBeenCalledWith(expect.objectContaining({ id: req.id }), 'pendingReminder');
    notify.toMerchant.mockClear();
    await tasks.remindPending(new Date());
    expect(notify.toMerchant).not.toHaveBeenCalledWith(expect.objectContaining({ id: req.id }), 'pendingReminder');

    // Moving a request answers it: confirmed at the new time.
    const moved = await merchantSvc.reschedule(merchantId, req.id, { startsAt: at('12:30').toISOString() });
    expect(moved).toMatchObject({ status: 'CONFIRMED', startsAt: at('12:30').toISOString() });
    expect(notify.toClient).toHaveBeenCalledWith(expect.objectContaining({ id: req.id }), 'rescheduled');
  });

  it('the merchant moves a booking, never on top of another, and the old slot is free again', async () => {
    const b = await merchantSvc.createBooking(merchantId, { serviceId, clientId: clients[0], startsAt: at('14:00').toISOString() });
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    const moved = await merchantSvc.reschedule(merchantId, b.id, { startsAt: at('09:00').toISOString() });
    expect(moved.startsAt).toBe(at('09:00').toISOString());
    // Same duration and buffer.
    expect(new Date(moved.blockedUntil).getTime() - new Date(moved.startsAt).getTime())
      .toBe(before.blockedUntil.getTime() - before.startsAt.getTime());
    await expect(merchantSvc.reschedule(merchantId, b.id, { startsAt: at('15:00').toISOString() }))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(merchantSvc.reschedule(merchantId, b.id, { startsAt: new Date(Date.now() - 60_000).toISOString() }))
      .rejects.toBeInstanceOf(BadRequestException);
    const day = await client.availabilityForDay(merchantId, serviceId, monday);
    expect(day.slots.map((s) => s.startsAt)).toContain(at('14:00').toISOString());
    expect(day.slots.map((s) => s.startsAt)).not.toContain(at('09:00').toISOString());
  });

  it('a decline carries the merchant reason to the client', async () => {
    const req = await client.create(clients[3], merchantId, { serviceId, startsAt: at('17:00').toISOString() });
    expect(req.status).toBe('PENDING');
    await merchantSvc.setStatus(merchantId, req.id, 'decline', '  Complet ce jour-là  ');
    expect((await client.get(clients[3], req.id)).cancelReason).toBe('Complet ce jour-là');
    expect(notify.toClient).toHaveBeenCalledWith(
      expect.objectContaining({ id: req.id, cancelReason: 'Complet ce jour-là' }),
      'declined',
    );
  });

  it('lists the days of the window that still have a free slot', async () => {
    const { days } = await client.availableDays(merchantId, serviceId);
    expect(days).toContain(monday);
    // The fiche only opens on Mondays.
    expect(days.every((d) => isoWeekdayOfYmd(d) === 1)).toBe(true);
  });

  it('the agenda lists the day with the pending count', async () => {
    const agenda = await merchantSvc.agenda(merchantId, { from: at('00:00').toISOString(), to: at('23:59').toISOString() });
    expect(agenda.bookings.length).toBeGreaterThanOrEqual(3);
    expect(agenda.bookings.every((b) => b.status !== 'EXPIRED')).toBe(true);
  });

  it('admin: custom services become catalogue suggestions until added', async () => {
    const admin = new BookingAdminService(prisma);
    const before = await admin.customServiceSuggestions('COIFFURE');
    expect(before.find((x) => x.nom === 'Coupe + soin argan')).toMatchObject({ merchants: 1, avgDurationMin: 60 });

    const tpl = await admin.createTemplate({ category: 'COIFFURE', nom: 'coupe + soin argan' });
    const after = await admin.customServiceSuggestions('COIFFURE');
    expect(after.find((x) => x.nom === 'Coupe + soin argan')).toBeUndefined();
    await prisma.serviceTemplate.delete({ where: { id: tpl.id } });

    const stats = await admin.stats();
    expect(stats.merchantsEnabled).toBeGreaterThanOrEqual(1);
    expect(stats.customServices).toBeGreaterThanOrEqual(1);
  });

  it('a merchant at its FREE client limit still gets the booking, without a new loyalty card', async () => {
    await prisma.bookingSettings.update({ where: { merchantId }, data: { autoConfirm: true } });
    plan.assertCanAddClient.mockRejectedValueOnce(new ForbiddenException('limit'));
    // A client without any card yet (clients[1..5] may have won the 15:00 race).
    const fresh = await prisma.client.create({
      data: { prenom: 'Limit', telephone: `+2128${Date.now().toString().slice(-8)}`, telephoneVerified: true },
    });
    clients.push(fresh.id);
    const b = await client.create(fresh.id, merchantId, { serviceId, startsAt: at('11:00').toISOString() });
    expect(b.status).toBe('CONFIRMED');
    expect(b.timeZone).toBe(TZ);
    expect(await prisma.loyaltyCard.count({ where: { merchantId, clientId: fresh.id } })).toBe(0);
    expect((await client.get(fresh.id, b.id)).id).toBe(b.id);
  });

  it('parallel requests of one client cannot pass the upcoming bookings limit', async () => {
    const c = await prisma.client.create({
      data: { prenom: 'Rush', telephone: `+2127${Date.now().toString().slice(-8)}`, telephoneVerified: true },
    });
    clients.push(c.id);
    const starts = ['09:00', '09:45', '14:00', '17:15'];
    const results = await Promise.allSettled(
      starts.map((t) => client.create(c.id, merchantId, { serviceId, startsAt: at(t).toISOString() })),
    );
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(3);
    expect(await prisma.booking.count({ where: { clientId: c.id, status: { in: ['PENDING', 'CONFIRMED'] } } })).toBeLessThanOrEqual(3);
  }, 60_000);

  it('deleting a client account ends its bookings and coupons, and frees the slot', async () => {
    const stamp = Date.now().toString().slice(-8);
    const [leaving, next] = await Promise.all(['9', '5'].map((prefix) => prisma.client.create({
      data: { prenom: 'Closure', telephone: `+212${prefix}${stamp}`, telephoneVerified: true },
    })));
    clients.push(leaving.id, next.id);
    const startsAt = at('10:00', addDaysYmd(monday, 7)).toISOString();
    const booking = await client.create(leaving.id, merchantId, { serviceId, startsAt });
    const coupon = await prisma.coupon.create({
      data: {
        clientId: leaving.id, merchantId, code: stamp.slice(-6), type: 'FREE_PRODUCT', label: 'Café', conditions: {},
        validFrom: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const closure = new ClientClosureService({ run: (fn: never) => prisma.$transaction(fn) } as never, notify as unknown as BookingNotifyService);
    await closure.close(leaving.id, (tx, now) => tx.client.update({ where: { id: leaving.id }, data: { deletedAt: now } }));

    expect((await merchantSvc.getOne(merchantId, booking.id)).status).toBe('CANCELLED_CLIENT');
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).status).toBe('CANCELLED');
    expect(await prisma.loyaltyCard.count({ where: { clientId: leaving.id, deactivatedAt: null } })).toBe(0);
    expect(notify.toMerchant).toHaveBeenCalledWith(expect.objectContaining({ id: booking.id }), 'cancelledByClient');
    expect((await client.create(next.id, merchantId, { serviceId, startsAt })).status).toBe('CONFIRMED');
  });

  it('optional fields sent as null are ignored instead of failing', async () => {
    const svc = await merchantSvc.updateService(merchantId, serviceId, { nom: null, durationMin: null, isActive: null } as never);
    expect(svc).toMatchObject({ nom: 'Coupe femme', durationMin: 45, isActive: true });
    const settings = await merchantSvc.updateSettings(merchantId, { minNoticeMinutes: null } as never);
    expect(settings.minNoticeMinutes).toBe(60);
  });

  it('capacity 2: two bookings at the same time, a third is refused; lowering keeps the bookings', async () => {
    const day = addDaysYmd(monday, 7);
    const start = at('16:00', day).toISOString();
    const seats = () => prisma.bookingResource.findMany({ where: { merchantId, isActive: true }, select: { id: true } });

    await merchantSvc.updateSettings(merchantId, { capacity: 2 });
    const [, seat2] = await seats();
    expect(await seats()).toHaveLength(2);
    // The new seat offers the same services as the main calendar.
    expect(await prisma.serviceResource.count({ where: { resourceId: seat2.id } }))
      .toBe(await prisma.serviceResource.count({ where: { resourceId } }));

    const a = await client.create(clients[2], merchantId, { serviceId, startsAt: start });
    const b = await merchantSvc.createBooking(merchantId, { serviceId, startsAt: start, clientName: 'Seconde' });
    expect([a.status, b.status]).toEqual(['CONFIRMED', 'CONFIRMED']);
    const taken = await prisma.booking.findMany({ where: { merchantId, startsAt: new Date(start), status: 'CONFIRMED' }, select: { resourceId: true } });
    expect(new Set(taken.map((t) => t.resourceId)).size).toBe(2);

    // Full: the slot is gone and a third booking is refused.
    const left = await client.availabilityForDay(merchantId, serviceId, day);
    expect(left.slots.map((s) => s.startsAt)).not.toContain(start);
    await expect(
      merchantSvc.createBooking(merchantId, { serviceId, startsAt: start, clientName: 'Troisième' }),
    ).rejects.toBeInstanceOf(ConflictException);

    // A new service and new hours reach every seat.
    const brushing = await merchantSvc.createService(merchantId, { nom: 'Brushing', durationMin: 30 });
    expect(await prisma.serviceResource.count({ where: { serviceId: brushing!.id } })).toBe(2);
    await merchantSvc.setHours(merchantId, [{ weekday: 1, startMin: 540, endMin: 1080 }]);
    expect(await prisma.workingHours.count({ where: { resourceId: seat2.id } })).toBe(1);
    await merchantSvc.setHours(merchantId, []);

    // Back to 1: the extra seat is put aside, its booking stays; raising again reuses it.
    await merchantSvc.updateSettings(merchantId, { capacity: 1 });
    expect(await seats()).toHaveLength(1);
    expect(await prisma.booking.count({ where: { merchantId, startsAt: new Date(start), status: 'CONFIRMED' } })).toBe(2);
    await merchantSvc.updateSettings(merchantId, { capacity: 2 });
    expect(await prisma.bookingResource.count({ where: { merchantId } })).toBe(2);
    await merchantSvc.updateSettings(merchantId, { capacity: 1 });
  });
});
