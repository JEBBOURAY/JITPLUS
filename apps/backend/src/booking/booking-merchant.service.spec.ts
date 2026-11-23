import { BadRequestException } from '@nestjs/common';
import { rangesFromOpeningHours } from './availability';
import { BookingAvailabilityService } from './booking-availability.service';
import { assertValidRanges, BookingMerchantService, remindersAfterMove } from './booking-merchant.service';
import { isOverlapViolation } from './booking.constants';
import { clientBookingText, merchantBookingText } from './booking-messages';
import { buildBookingConfirmedEmail, getBookingConfirmedSubject } from '../mail/email-templates';

describe('rangesFromOpeningHours', () => {
  it('converts the fiche hours, split days and midnight closing included', () => {
    const ranges = rangesFromOpeningHours({
      mon: { slots: [{ open: '09:00', close: '12:30' }, { open: '14:00', close: '19:00' }] },
      tue: { closed: true, slots: [{ open: '09:00', close: '18:00' }] },
      sat: { slots: [{ open: '18:00', close: '00:00' }] },
    });
    expect(ranges).toEqual([
      { weekday: 1, startMin: 540, endMin: 750 },
      { weekday: 1, startMin: 840, endMin: 1140 },
      { weekday: 6, startMin: 1080, endMin: 1440 },
    ]);
  });

  it('ignores missing or malformed hours', () => {
    expect(rangesFromOpeningHours(null)).toEqual([]);
    expect(rangesFromOpeningHours({ mon: { slots: [{ open: 'x', close: '10:00' }] } })).toEqual([]);
    expect(rangesFromOpeningHours({ mon: { slots: [{ open: '12:00', close: '10:00' }] } })).toEqual([]);
  });
});

describe('booking hours', () => {
  const openingHours = { mon: { slots: [{ open: '09:00', close: '10:00' }] } };
  const monday = '2030-01-07';
  const service = { id: 's1', durationMin: 30, bufferMin: 0, resources: [{ resourceId: 'r1' }] };
  const ctx = (shopHours = rangesFromOpeningHours(openingHours)) => ({
    merchant: { id: 'm1', currency: 'MAD' },
    settings: { enabled: true, autoConfirm: true, minNoticeMinutes: 0, maxAdvanceDays: 36500, cancelDeadlineHours: 2, slotStepMinutes: 30, noShowLimit: 3, capacity: 1 },
    tz: 'UTC',
    shopHours,
  });
  const availabilityWith = (hours: unknown[]) =>
    new BookingAvailabilityService({
      workingHours: { findMany: jest.fn().mockResolvedValue(hours) },
      availabilityException: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);
  const startsOf = (slots: { startsAt: Date }[]) => slots.map((s) => s.startsAt.toISOString().slice(11, 16));
  const now = new Date('2030-01-01T00:00:00Z');

  it('follows the opening hours while the calendar has none of its own', async () => {
    const slots = await availabilityWith([]).slotsForDay(ctx(), service, monday, { now });
    expect(startsOf(slots)).toEqual(['09:00', '09:30']);
  });

  it('uses the calendar hours instead, even when they skip that day', async () => {
    const custom = [{ resourceId: 'r1', weekday: 1, startMin: 14 * 60, endMin: 14 * 60 + 30 }];
    expect(startsOf(await availabilityWith(custom).slotsForDay(ctx(), service, monday, { now }))).toEqual(['14:00']);
    const tuesdayOnly = [{ resourceId: 'r1', weekday: 2, startMin: 540, endMin: 600 }];
    expect(await availabilityWith(tuesdayOnly).slotsForDay(ctx(), service, monday, { now })).toEqual([]);
  });

  const merchantService = (json: unknown, count: jest.Mock) =>
    new BookingMerchantService(
      {
        merchant: { findUnique: jest.fn().mockResolvedValue({ openingHours: json }) },
        bookableService: { count },
        bookingSettings: { upsert: jest.fn().mockResolvedValue({ enabled: true }) },
      } as never,
      {} as never,
      {} as never,
    );

  it('needs no hours of its own to enable booking when the shop has opening hours', async () => {
    const count = jest.fn().mockResolvedValue(1);
    await expect(merchantService(openingHours, count).updateSettings('m1', { enabled: true })).resolves.toMatchObject({ enabled: true });
    expect(count.mock.calls[0][0].where.resources.some.resource).toEqual({ isActive: true });
  });

  it('requires calendar hours when the shop has no opening hours', async () => {
    const count = jest.fn().mockResolvedValue(0);
    await expect(merchantService(null, count).updateSettings('m1', { enabled: true })).rejects.toThrow(BadRequestException);
    expect(count.mock.calls[0][0].where.resources.some.resource).toEqual({ isActive: true, workingHours: { some: {} } });
  });
});

describe('assertValidRanges', () => {
  it('accepts a day with a break', () => {
    expect(() =>
      assertValidRanges([
        { weekday: 1, startMin: 540, endMin: 720 },
        { weekday: 1, startMin: 840, endMin: 1080 },
        { weekday: 2, startMin: 540, endMin: 1080 },
      ]),
    ).not.toThrow();
  });

  it('rejects overlapping ranges on one day', () => {
    expect(() =>
      assertValidRanges([
        { weekday: 3, startMin: 540, endMin: 720 },
        { weekday: 3, startMin: 700, endMin: 900 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects an empty range', () => {
    expect(() => assertValidRanges([{ weekday: 1, startMin: 600, endMin: 600 }])).toThrow(BadRequestException);
  });
});

describe('isOverlapViolation', () => {
  it('recognises the exclusion constraint error', () => {
    expect(isOverlapViolation(new Error('violates exclusion constraint "bookings_no_overlap"'))).toBe(true);
    expect(isOverlapViolation({ meta: { code: '23P01' } })).toBe(true);
    expect(isOverlapViolation(new Error('unique constraint failed'))).toBe(false);
  });
});

describe('booking messages', () => {
  const v = { merchant: 'Salon Nour', service: 'Coupe femme', day: '24/11', time: '10:30', client: 'Sara' };

  it('speaks the client language, French by default', () => {
    expect(clientBookingText('confirmed', 'fr', v).title).toBe('Rendez-vous confirmé chez Salon Nour');
    expect(clientBookingText('confirmed', 'en', v).body).toBe('Coupe femme on 24/11 at 10:30.');
    expect(clientBookingText('reminderHour', 'xx', v).title).toBe('Bientôt chez Salon Nour');
  });

  it('adds the merchant reason to a decline or a cancellation, only when given', () => {
    expect(clientBookingText('declined', 'fr', { ...v, reason: 'complet ce jour-là' }).body).toMatch(/ Motif : complet ce jour-là$/);
    expect(clientBookingText('cancelled', 'ar', { ...v, reason: 'عطلة' }).body).toMatch(/ السبب: عطلة$/);
    expect(clientBookingText('cancelled', 'en', v).body).not.toContain('Reason');
  });

  it('names the client to the merchant', () => {
    expect(merchantBookingText('newPending', 'fr', v).body).toBe('Sara · Coupe femme le 24/11 à 10:30');
  });
});

describe('booking confirmation e-mail', () => {
  it('escapes merchant input and shows the booking', () => {
    const html = buildBookingConfirmedEmail(
      { merchant: 'Salon <b>Nour</b>', service: 'Coupe femme', date: 'lundi 23 novembre', time: '10:30', address: null, cancelDeadlineHours: 2 },
      'fr',
    );
    expect(html).toContain('Salon &lt;b&gt;Nour&lt;/b&gt; vous attend.');
    expect(html).toContain('10:30');
    expect(html).toContain("jusqu&#039;à 2 h avant");
    expect(getBookingConfirmedSubject({ merchant: 'Salon Nour' }, 'en')).toBe('Booking confirmed at Salon Nour');
    expect(getBookingConfirmedSubject({ merchant: 'Salon Nour', moved: true }, 'fr')).toBe('Rendez-vous déplacé chez Salon Nour');
  });
});

describe('remindersAfterMove', () => {
  const now = new Date('2026-11-23T10:00:00.000Z');
  const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);
  it('keeps both reminders for a visit moved days ahead', () => {
    expect(remindersAfterMove(inHours(72), now)).toEqual({ reminderDaySentAt: null, reminderHourSentAt: null });
  });
  it('skips the day-before reminder for a visit moved to later today', () => {
    expect(remindersAfterMove(inHours(8), now)).toEqual({ reminderDaySentAt: now, reminderHourSentAt: null });
  });
  it('skips both for a visit moved to the next hours', () => {
    expect(remindersAfterMove(inHours(1.5), now)).toEqual({ reminderDaySentAt: now, reminderHourSentAt: now });
  });
});
