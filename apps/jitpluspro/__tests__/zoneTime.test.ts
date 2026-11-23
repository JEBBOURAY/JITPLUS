import { wallParts, zoneOffsetMinutes } from '@jitplus/shared/src/zoneTime';
import { formatBookingTime, ymdInZone } from '@jitplus/shared/src/booking';
import { minutesIn, wallTimeToIso, ymdIn } from '@/utils/bookingTime';

const CASA = 'Africa/Casablanca';

/** Offset of `tz` at `ms` as Node's tzdata sees it (Node ships 2026c or later). */
function nodeOffset(tz: string, ms: number): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - ms) / 60_000);
}

describe('zoneTime — Morocco without trusting the JS engine', () => {
  it('matches tzdata every hour from 2024 to 2045 (Ramadan switches and the 2026-09-20 move to UTC+0 included)', () => {
    const end = Date.UTC(2046, 0, 1);
    for (let ms = Date.UTC(2024, 0, 1); ms < end; ms += 3_600_000) {
      const ours = zoneOffsetMinutes(CASA, new Date(ms));
      if (ours !== nodeOffset(CASA, ms)) throw new Error(`offset differs at ${new Date(ms).toISOString()}`);
    }
  });

  it('is UTC+1 outside Ramadan until 2026-09-20, UTC+0 during Ramadan, then UTC+0 for good', () => {
    expect(zoneOffsetMinutes(CASA, new Date('2026-06-15T08:00:00Z'))).toBe(60);
    expect(zoneOffsetMinutes(CASA, new Date('2026-03-01T08:00:00Z'))).toBe(0);
    expect(zoneOffsetMinutes(CASA, new Date('2026-09-20T00:59:00Z'))).toBe(60);
    expect(zoneOffsetMinutes(CASA, new Date('2026-09-20T01:00:00Z'))).toBe(0);
    expect(zoneOffsetMinutes(CASA, new Date('2026-11-23T08:00:00Z'))).toBe(0);
    expect(zoneOffsetMinutes(CASA, new Date('2030-07-01T08:00:00Z'))).toBe(0);
  });

  describe('with an engine on old tzdata (still prints Morocco at UTC+1)', () => {
    const RealDTF = Intl.DateTimeFormat;
    beforeAll(() => {
      // Pre-2026c tzdata: the Morocco zone is formatted one hour ahead after 2026-09-20.
      (Intl as { DateTimeFormat: unknown }).DateTimeFormat = function (locale?: string, options?: Intl.DateTimeFormatOptions) {
        const tz = options?.timeZone === CASA ? 'Africa/Lagos' : options?.timeZone;
        return new RealDTF(locale, { ...options, timeZone: tz });
      } as unknown as typeof Intl.DateTimeFormat;
    });
    afterAll(() => {
      (Intl as { DateTimeFormat: unknown }).DateTimeFormat = RealDTF;
    });

    it('shows a 9:00 slot as 09:00, not 10:00', () => {
      expect(formatBookingTime('2026-11-23T09:00:00.000Z', CASA)).toBe('09:00');
      expect(wallParts(new Date('2026-11-23T16:00:00.000Z'), CASA)).toMatchObject({ hour: 16, minute: 0 });
    });

    it('keeps a booking at 23:30 Morocco time on its own day', () => {
      expect(ymdInZone(new Date('2026-11-22T23:30:00.000Z'), CASA)).toBe('2026-11-22');
      expect(ymdIn(new Date('2026-11-22T23:30:00.000Z'), CASA)).toBe('2026-11-22');
    });

    it('turns 10:00 typed by the merchant into the right UTC instant on each side of 2026-09-20', () => {
      expect(wallTimeToIso('2026-11-23', 600, CASA)).toBe('2026-11-23T10:00:00.000Z');
      expect(wallTimeToIso('2026-06-15', 600, CASA)).toBe('2026-06-15T09:00:00.000Z');
      expect(wallTimeToIso('2026-03-02', 600, CASA)).toBe('2026-03-02T10:00:00.000Z');
      expect(minutesIn(new Date('2026-11-23T10:00:00.000Z'), CASA)).toBe(600);
    });

    it('leaves other zones to Intl', () => {
      expect(formatBookingTime('2026-11-23T08:00:00.000Z', 'Europe/London')).toBe('08:00');
      expect(formatBookingTime('2026-07-01T08:00:00.000Z', 'Europe/Paris')).toBe('10:00');
    });
  });
});
