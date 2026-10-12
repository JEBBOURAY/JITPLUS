import {
  diffDaysYmd,
  endOfMoroccoDay,
  formatMoroccoDayMonth,
  isValidYmd,
  moroccoOffsetMinutes,
  moroccoParts,
  moroccoYmd,
} from './morocco-time';

describe('morocco-time', () => {
  it('uses UTC+1 outside Ramadan', () => {
    const d = new Date('2026-01-15T12:00:00Z');
    expect(moroccoOffsetMinutes(d)).toBe(60);
    const p = moroccoParts(d);
    expect(p.hour).toBe(13);
    expect(p.isoWeekday).toBe(4); // Thursday
    expect(p.minutes).toBe(13 * 60);
  });

  it('follows the Ramadan switch to UTC+0 (tzdata)', () => {
    // Ramadan 2026 ≈ 18 Feb – 19 Mar: Morocco runs on UTC+0
    expect(moroccoOffsetMinutes(new Date('2026-03-01T12:00:00Z'))).toBe(0);
  });

  it('computes the end of a Morocco day', () => {
    expect(endOfMoroccoDay('2026-01-15').toISOString()).toBe('2026-01-15T22:59:59.999Z');
    expect(endOfMoroccoDay('2026-03-01').toISOString()).toBe('2026-03-01T23:59:59.999Z');
    expect(moroccoYmd(endOfMoroccoDay('2026-01-15'))).toBe('2026-01-15');
  });

  it('rolls the date over at Morocco midnight, not UTC midnight', () => {
    expect(moroccoYmd(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
    expect(formatMoroccoDayMonth(new Date('2026-01-15T23:30:00Z'))).toBe('16/01');
  });

  it('validates and diffs YYYY-MM-DD', () => {
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('2026-1-01')).toBe(false);
    expect(diffDaysYmd('2026-01-30', '2026-02-02')).toBe(3);
    expect(diffDaysYmd('2026-02-02', '2026-01-30')).toBe(-3);
  });
});
