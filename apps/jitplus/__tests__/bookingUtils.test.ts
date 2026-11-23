import {
  bookableDays, bookingStatusTone, classifyBookingError, dayChipParts, formatBookingDay, formatYmdLong,
  groupSlotsByPeriod, isBookingNotFound, makeIdempotencyKey,
} from '@/utils/booking';

const TZ = 'Africa/Casablanca';

describe('booking utils', () => {
  it('lists today then maxAdvanceDays more, in the merchant zone', () => {
    // 23:30 UTC on Jun 30 is already Jul 1 in Casablanca (UTC+1 until 2026-09-20).
    const days = bookableDays(TZ, 2, new Date('2026-06-30T23:30:00Z'));
    expect(days).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    // Since 2026-09-20 Morocco is on UTC+0: 23:30 UTC stays on the same day.
    expect(bookableDays(TZ, 0, new Date('2026-11-30T23:30:00Z'))).toEqual(['2026-11-30']);
    expect(bookableDays(TZ, 0, new Date('2026-11-17T10:00:00Z'))).toEqual(['2026-11-17']);
  });

  it('follows the Ramadan switch to UTC+0 and DST zones', () => {
    // Morocco is on UTC+0 during Ramadan (Mar 1, 2026): 23:30 UTC is still the same day.
    expect(bookableDays(TZ, 1, new Date('2026-03-01T23:30:00Z'))).toEqual(['2026-03-01', '2026-03-02']);
    // Across a DST change the strip stays one entry per calendar day.
    expect(bookableDays('Europe/Paris', 2, new Date('2026-03-28T12:00:00Z'))).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('formats calendar days without shifting them', () => {
    expect(dayChipParts('2026-11-23', 'fr').day).toBe('23');
    expect(formatBookingDay('2026-06-23T23:30:00Z', TZ, 'en')).toMatch(/24/);
    expect(formatBookingDay('2026-11-23T23:30:00Z', TZ, 'en')).toMatch(/23/);
    // Cached formatters stay per locale.
    expect(formatYmdLong('2026-11-23', 'en')).toMatch(/Monday/);
    expect(formatYmdLong('2026-11-23', 'fr')).toMatch(/lundi/);
  });

  it('tells a missing booking from other errors', () => {
    expect(isBookingNotFound({ response: { status: 404 } })).toBe(true);
    expect(isBookingNotFound({ response: { status: 500 } })).toBe(false);
    expect(isBookingNotFound(new Error('Network Error'))).toBe(false);
    expect(isBookingNotFound(undefined)).toBe(false);
  });

  it('makes short unique idempotency keys', () => {
    const a = makeIdempotencyKey();
    const b = makeIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(64);
  });

  it('classifies booking errors', () => {
    expect(classifyBookingError(409, 'Ce créneau vient d’être pris, choisissez-en un autre')).toBe('slotTaken');
    expect(classifyBookingError(409, 'Vous avez déjà 3 rendez-vous à venir chez ce commerçant')).toBe('conflict');
    expect(classifyBookingError(403, 'Vérifiez votre téléphone')).toBe('verify');
    expect(classifyBookingError(undefined, 'Network Error')).toBe('other');
    expect(classifyBookingError(409, 'This time was just taken.', 'error.booking.slotTaken')).toBe('slotTaken');
    expect(classifyBookingError(409, 'Ce créneau…', 'error.booking.maxUpcoming')).toBe('conflict');
  });

  it('maps statuses to tones', () => {
    expect(bookingStatusTone('CONFIRMED')).toBe('success');
    expect(bookingStatusTone('PENDING')).toBe('warning');
    expect(bookingStatusTone('DECLINED')).toBe('danger');
    expect(bookingStatusTone('CANCELLED_CLIENT')).toBe('muted');
  });
});

describe('slot periods', () => {
  it('groups the slots of the day into morning, afternoon and evening, in order', () => {
    expect(groupSlotsByPeriod(['09:00', '11:45', '12:00', '16:59', '17:00', '19:30'])).toEqual([
      { period: 'morning', indexes: [0, 1] },
      { period: 'afternoon', indexes: [2, 3] },
      { period: 'evening', indexes: [4, 5] },
    ]);
    expect(groupSlotsByPeriod([])).toEqual([]);
  });
});
