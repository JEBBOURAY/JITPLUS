import { computeSlots, freeIntervals, mergeIntervals, subtractIntervals, ResourceDay } from './availability';
import { addDaysYmd, isoWeekdayOfYmd, timeZoneForCountry, wallTimeToUtc } from './booking-time';
import { moroccoWallTimeToUtc } from '../common/utils/morocco-time';

const TZ = 'Africa/Casablanca';
const DAY = '2026-11-23'; // a Monday
const at = (hhmm: string, ymd = DAY) => {
  const [h, m] = hhmm.split(':').map(Number);
  return wallTimeToUtc(TZ, ymd, h * 60 + m);
};
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

function resource(overrides: Partial<ResourceDay> = {}): ResourceDay {
  return {
    id: 'r1',
    hours: [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60 }],
    exceptions: [],
    busy: [],
    ...overrides,
  };
}

const query = (overrides: Partial<Parameters<typeof computeSlots>[1]> = {}) => ({
  tz: TZ,
  ymd: DAY,
  durationMin: 30,
  bufferMin: 0,
  stepMin: 15,
  notBefore: new Date(0),
  ...overrides,
});

describe('interval helpers', () => {
  it('merges overlapping and touching intervals', () => {
    expect(mergeIntervals([[5, 8], [1, 3], [3, 4], [7, 10]])).toEqual([[1, 4], [5, 10]]);
  });

  it('subtracts a hole from the middle and trims the edges', () => {
    expect(subtractIntervals([[0, 100]], [[20, 30], [90, 120], [-5, 5]])).toEqual([[5, 20], [30, 90]]);
  });
});

describe('booking-time', () => {
  it('knows the weekday of a calendar day', () => {
    expect(isoWeekdayOfYmd('2026-11-23')).toBe(1);
    expect(isoWeekdayOfYmd('2026-11-29')).toBe(7);
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('matches the Morocco helper, Ramadan included', () => {
    for (const ymd of ['2026-03-01', '2026-06-15', '2026-11-23']) {
      expect(wallTimeToUtc(TZ, ymd, 9 * 60).toISOString()).toBe(moroccoWallTimeToUtc(ymd, 9, 0).toISOString());
    }
  });

  it('maps countries to a zone, Morocco by default', () => {
    expect(timeZoneForCountry('fr')).toBe('Europe/Paris');
    expect(timeZoneForCountry(undefined)).toBe(TZ);
    expect(timeZoneForCountry('XX')).toBe(TZ);
  });
});

describe('computeSlots', () => {
  it('lists every 15-minute start where 30 minutes fit in 09:00–12:00', () => {
    const slots = computeSlots([resource()], query());
    expect(slots.map((s) => hhmm(s.startsAt))).toEqual([
      '09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45',
      '11:00', '11:15', '11:30',
    ]);
    expect(hhmm(slots[0].endsAt)).toBe('09:30');
  });

  it('returns nothing on a day without hours', () => {
    expect(computeSlots([resource()], query({ ymd: '2026-11-24' }))).toEqual([]);
  });

  it('respects a lunch break given as two ranges', () => {
    const r = resource({
      hours: [
        { weekday: 1, startMin: 9 * 60, endMin: 10 * 60 },
        { weekday: 1, startMin: 14 * 60, endMin: 15 * 60 },
      ],
    });
    const starts = computeSlots([r], query({ durationMin: 60 })).map((s) => hhmm(s.startsAt));
    expect(starts).toEqual(['09:00', '14:00']);
  });

  it('skips booked time including its buffer', () => {
    const r = resource({ busy: [{ startsAt: at('10:00'), blockedUntil: at('10:45') }] });
    const starts = computeSlots([r], query()).map((s) => hhmm(s.startsAt));
    expect(starts).toContain('09:30');
    expect(starts).not.toContain('09:45');
    expect(starts).not.toContain('10:30');
    expect(starts).toContain('10:45');
  });

  it('needs room for the service buffer too', () => {
    const starts = computeSlots([resource()], query({ bufferMin: 15 })).map((s) => hhmm(s.startsAt));
    expect(starts.at(-1)).toBe('11:15');
  });

  it('drops starts before the minimum notice', () => {
    const starts = computeSlots([resource()], query({ notBefore: at('10:05') })).map((s) => hhmm(s.startsAt));
    expect(starts[0]).toBe('10:15');
  });

  it('applies closures and extra openings', () => {
    const r = resource({
      exceptions: [
        { type: 'CLOSED', startsAt: at('09:00'), endsAt: at('11:00') },
        { type: 'OPEN', startsAt: at('18:00'), endsAt: at('19:00') },
      ],
    });
    const starts = computeSlots([r], query({ durationMin: 60 })).map((s) => hhmm(s.startsAt));
    expect(starts).toEqual(['11:00', '18:00']);
  });

  it('a whole-day closure leaves no slot', () => {
    const r = resource({ exceptions: [{ type: 'CLOSED', startsAt: at('00:00'), endsAt: at('00:00', addDaysYmd(DAY, 1)) }] });
    expect(computeSlots([r], query())).toEqual([]);
  });

  it('merges resources and tells which ones are free', () => {
    const a = resource({ id: 'a', busy: [{ startsAt: at('09:00'), blockedUntil: at('09:30') }] });
    const b = resource({ id: 'b' });
    const slots = computeSlots([a, b], query());
    expect(slots[0].resourceIds).toEqual(['b']);
    expect(slots.find((s) => hhmm(s.startsAt) === '09:30')?.resourceIds).toEqual(['a', 'b']);
  });

  it('places hours on the right UTC instant during Ramadan', () => {
    // 2026-03-02 is a Monday inside Ramadan, when Morocco runs on UTC+0.
    const ramadanDay = '2026-03-02';
    const r = resource();
    const [first] = computeSlots([r], query({ ymd: ramadanDay }));
    expect(first.startsAt.toISOString()).toBe(moroccoWallTimeToUtc(ramadanDay, 9, 0).toISOString());
    expect(freeIntervals(r, TZ, ramadanDay)).toHaveLength(1);
  });
});

/**
 * Audit 2026-11-21: computeSlots resolves the day once instead of calling Intl
 * for every grid step. The result must stay the one of the step-by-step
 * conversion, clock-change days included.
 */
describe('computeSlots — same starts as converting every step', () => {
  const allDay = (weekday: number): ResourceDay => ({
    id: 'r1', hours: [{ weekday, startMin: 0, endMin: 1440 }], exceptions: [], busy: [],
  });
  function reference(tz: string, ymd: string, stepMin: number): string[] {
    const [[from, to]] = freeIntervals(allDay(isoWeekdayOfYmd(ymd)), tz, ymd);
    const seen = new Set<number>();
    for (let m = 0; m < 1440; m += stepMin) {
      const start = wallTimeToUtc(tz, ymd, m).getTime();
      if (start >= from && start + 30 * 60_000 <= to) seen.add(start);
    }
    return [...seen].map((ms) => new Date(ms).toISOString());
  }

  it.each([
    ['Africa/Casablanca', '2026-11-23'], // ordinary day
    ['Africa/Casablanca', '2026-02-15'], // clocks go back for Ramadan
    ['Africa/Casablanca', '2026-03-22'], // clocks go forward after Ramadan
    ['Europe/Paris', '2026-03-29'], // 23-hour day
    ['Europe/Paris', '2026-10-25'], // 25-hour day
    ['Europe/Paris', '2026-07-14'],
  ])('%s on %s', (tz, ymd) => {
    for (const stepMin of [5, 15, 30]) {
      const slots = computeSlots([allDay(isoWeekdayOfYmd(ymd))], { tz, ymd, durationMin: 30, bufferMin: 0, stepMin, notBefore: new Date(0) });
      expect(slots.map((s) => s.startsAt.toISOString())).toEqual(reference(tz, ymd, stepMin));
    }
  });

  it('agrees on every day of a year in Morocco', () => {
    for (let ymd = '2026-01-01'; ymd < '2027-01-01'; ymd = addDaysYmd(ymd, 1)) {
      const slots = computeSlots([allDay(isoWeekdayOfYmd(ymd))], { tz: TZ, ymd, durationMin: 30, bufferMin: 0, stepMin: 30, notBefore: new Date(0) });
      expect(slots.map((s) => s.startsAt.toISOString())).toEqual(reference(TZ, ymd, 30));
    }
  });
});
