import { moroccoDayStart } from './admin-crm.service';

describe('moroccoDayStart', () => {
  it('returns local midnight in Morocco (UTC+1 outside Ramadan)', () => {
    // 2026-11-07 20:30 UTC = 21:30 in Casablanca
    const now = new Date('2026-11-07T20:30:00Z');
    expect(moroccoDayStart(now).toISOString()).toBe('2026-11-06T23:00:00.000Z');
    expect(moroccoDayStart(now, 1).toISOString()).toBe('2026-11-07T23:00:00.000Z');
  });

  it('rolls to the next day once it is past midnight in Morocco but not in UTC', () => {
    // 23:30 UTC = 00:30 the next day in Casablanca
    const now = new Date('2026-11-07T23:30:00Z');
    expect(moroccoDayStart(now).toISOString()).toBe('2026-11-07T23:00:00.000Z');
  });

  it('handles month boundaries with negative offsets', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    expect(moroccoDayStart(now, -6).toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });
});
