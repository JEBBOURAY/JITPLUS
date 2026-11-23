import { deviceTimeZone, mondayOf, minutesIn, parseTimeInput, wallTimeToIso, ymdIn, ymdToDate } from '@/utils/bookingTime';
import { freeGaps, freeStartMinutes, parseDuration, parsePrice } from '@/components/booking/bookingForm';
import { pendingExpiresAt } from '@jitplus/shared/src/booking';
import { rangesOfDraft, weekDraftOf } from '@/components/booking/HoursEditor';

describe('booking time helpers', () => {
  it('falls back on the phone zone until the API gives the shop zone', () => {
    expect(deviceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Casablanca');
  });

  it('follows Morocco across the Ramadan switch to UTC+0', () => {
    // 2026: UTC+1 most of the year, UTC+0 during Ramadan (mid-February to late March).
    expect(wallTimeToIso('2026-02-10', 9 * 60, 'Africa/Casablanca')).toBe('2026-02-10T08:00:00.000Z');
    expect(wallTimeToIso('2026-03-01', 9 * 60, 'Africa/Casablanca')).toBe('2026-03-01T09:00:00.000Z');
  });

  it('formats a calendar day on that same day, even east of UTC+12', () => {
    // Noon UTC is already the next day in Auckland (UTC+13 in November).
    expect(ymdIn(ymdToDate('2026-11-17', 'Pacific/Auckland'), 'Pacific/Auckland')).toBe('2026-11-17');
    expect(ymdIn(ymdToDate('2026-11-17', 'America/Los_Angeles'), 'America/Los_Angeles')).toBe('2026-11-17');
  });

  it('converts a wall-clock time to UTC and back', () => {
    // Paris in winter is UTC+1, in summer UTC+2.
    expect(wallTimeToIso('2026-01-15', 9 * 60, 'Europe/Paris')).toBe('2026-01-15T08:00:00.000Z');
    expect(wallTimeToIso('2026-07-15', 9 * 60, 'Europe/Paris')).toBe('2026-07-15T07:00:00.000Z');
    const iso = wallTimeToIso('2026-11-23', 14 * 60 + 30, 'Africa/Casablanca');
    expect(ymdIn(new Date(iso), 'Africa/Casablanca')).toBe('2026-11-23');
    expect(minutesIn(new Date(iso), 'Africa/Casablanca')).toBe(14 * 60 + 30);
  });

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-11-17')).toBe('2026-11-16');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  });

  it('reads the times merchants type', () => {
    expect(parseTimeInput('09:30')).toBe(570);
    expect(parseTimeInput('9h30')).toBe(570);
    expect(parseTimeInput('930')).toBe(570);
    expect(parseTimeInput('9')).toBe(540);
    expect(parseTimeInput('24:00')).toBe(1440);
    expect(parseTimeInput('24:30')).toBeNull();
    expect(parseTimeInput('12:75')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
  });
});

describe('booking form helpers', () => {
  it('validates durations and prices like the backend', () => {
    expect(parseDuration('30')).toBe(30);
    expect(parseDuration('4')).toBeNull();
    expect(parseDuration('721')).toBeNull();
    expect(parseDuration('30.5')).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('25,5')).toBe(25.5);
    expect(parsePrice('-3')).toBeNaN();
    expect(parsePrice('1.234')).toBeNaN();
  });

  it('round-trips weekly hours and rejects overlaps', () => {
    const hours = [
      { weekday: 1, startMin: 540, endMin: 720 },
      { weekday: 1, startMin: 840, endMin: 1140 },
      { weekday: 6, startMin: 600, endMin: 960 },
    ];
    const draft = weekDraftOf(hours);
    expect(draft[0]).toEqual([{ start: '09:00', end: '12:00' }, { start: '14:00', end: '19:00' }]);
    expect(draft[1]).toEqual([]);
    expect(rangesOfDraft(draft)).toEqual({ ranges: hours });

    draft[0][1].start = '11:00';
    expect(rangesOfDraft(draft)).toEqual({ error: 'booking.hours.errOverlap', weekday: 1 });
    draft[0][1] = { start: '18:00', end: '17:00' };
    expect(rangesOfDraft(draft)).toEqual({ error: 'booking.hours.errOrder', weekday: 1 });
  });
});

describe('free slots of a new booking', () => {
  const base = { open: [{ startMin: 540, endMin: 660 }], busy: [], stepMin: 30, needMin: 30, notBefore: 0 };

  it('keeps the starts where the service fits before closing', () => {
    expect(freeStartMinutes({ ...base, needMin: 60 })).toEqual([540, 570, 600]);
  });

  it('skips what is taken and what is already past', () => {
    expect(freeStartMinutes({ ...base, busy: [{ startMin: 570, endMin: 600 }], notBefore: 545 })).toEqual([600, 630]);
  });
});

describe('free stretches of the agenda day', () => {
  const open = [{ startMin: 540, endMin: 720 }, { startMin: 840, endMin: 1080 }];

  it('lists the gaps between bookings, inside the hours only', () => {
    const busy = [{ startMin: 600, endMin: 660 }, { startMin: 900, endMin: 960 }];
    expect(freeGaps({ open, busy, minMin: 15 })).toEqual([
      { startMin: 540, endMin: 600 },
      { startMin: 660, endMin: 720 },
      { startMin: 840, endMin: 900 },
      { startMin: 960, endMin: 1080 },
    ]);
  });

  it('drops gaps too short for the shortest service and the past of today', () => {
    const busy = [{ startMin: 550, endMin: 700 }];
    expect(freeGaps({ open, busy, minMin: 30, notBefore: 870 })).toEqual([{ startMin: 870, endMin: 1080 }]);
  });

  it('handles overlapping bookings and closures', () => {
    const busy = [{ startMin: 500, endMin: 620 }, { startMin: 600, endMin: 700 }, { startMin: 690, endMin: 760 }];
    expect(freeGaps({ open, busy, minMin: 15 })).toEqual([{ startMin: 840, endMin: 1080 }]);
  });

  it('with 2 seats, a stretch stays free until both are taken', () => {
    const busy = [{ startMin: 600, endMin: 660 }, { startMin: 630, endMin: 690 }, { startMin: 900, endMin: 960 }];
    // Only 10:30-11:00 holds two bookings; one booking alone leaves a seat free.
    expect(freeGaps({ open, busy, minMin: 15, capacity: 2 })).toEqual([
      { startMin: 540, endMin: 630 },
      { startMin: 660, endMin: 720 },
      { startMin: 840, endMin: 1080 },
    ]);
  });

  it('back-to-back bookings never count as overlapping', () => {
    const busy = [{ startMin: 600, endMin: 660 }, { startMin: 660, endMin: 720 }];
    expect(freeGaps({ open, busy, minMin: 15, capacity: 2 })).toEqual([
      { startMin: 540, endMin: 720 },
      { startMin: 840, endMin: 1080 },
    ]);
  });

  it('a closure blocks every seat', () => {
    expect(freeGaps({ open, busy: [], closed: [{ startMin: 840, endMin: 1080 }], minMin: 15, capacity: 3 }))
      .toEqual([{ startMin: 540, endMin: 720 }]);
  });
});

describe('pending request expiry', () => {
  it('expires 12 h after the request, or at the start when sooner', () => {
    expect(pendingExpiresAt({ createdAt: '2026-11-19T08:00:00.000Z', startsAt: '2026-11-25T10:00:00.000Z' }).toISOString())
      .toBe('2026-11-19T20:00:00.000Z');
    expect(pendingExpiresAt({ createdAt: '2026-11-19T08:00:00.000Z', startsAt: '2026-11-19T11:00:00.000Z' }).toISOString())
      .toBe('2026-11-19T11:00:00.000Z');
  });
});
