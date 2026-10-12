import {
  getNotifSection, groupNotificationsBySection, getRelativeAge,
} from '@/utils/notificationTime';

const NOW = new Date(2026, 9, 10, 15, 0, 0); // Sat 10 Oct 2026, 15:00 local

function at(daysAgo: number, hours = 12, minutes = 0): Date {
  return new Date(2026, 9, 10 - daysAgo, hours, minutes, 0);
}

describe('getNotifSection', () => {
  it('classifies earlier today as today', () => {
    expect(getNotifSection(at(0, 0, 1), NOW)).toBe('today');
  });

  it('treats future dates (clock skew) as today', () => {
    expect(getNotifSection(at(0, 16), NOW)).toBe('today');
  });

  it('classifies yesterday, including late evening', () => {
    expect(getNotifSection(at(1, 0, 0), NOW)).toBe('yesterday');
    expect(getNotifSection(at(1, 23, 59), NOW)).toBe('yesterday');
  });

  it('classifies 2-6 days ago as this week', () => {
    expect(getNotifSection(at(2), NOW)).toBe('thisWeek');
    expect(getNotifSection(at(6, 0, 0), NOW)).toBe('thisWeek');
  });

  it('classifies 7+ days ago as earlier', () => {
    expect(getNotifSection(at(7, 23, 59), NOW)).toBe('earlier');
    expect(getNotifSection(at(40), NOW)).toBe('earlier');
  });
});

describe('groupNotificationsBySection', () => {
  const make = (id: string, d: Date) => ({ id, createdAt: d.toISOString() });

  it('returns an empty list for no notifications', () => {
    expect(groupNotificationsBySection([], NOW)).toEqual([]);
  });

  it('inserts one header per section, in order', () => {
    const items = groupNotificationsBySection([
      make('a', at(0, 14)),
      make('b', at(0, 9)),
      make('c', at(1)),
      make('d', at(3)),
      make('e', at(30)),
    ], NOW);

    expect(items.map((i) => (i.kind === 'header' ? `#${i.section}` : i.key))).toEqual([
      '#today', 'a', 'b', '#yesterday', 'c', '#thisWeek', 'd', '#earlier', 'e',
    ]);
  });

  it('produces unique keys', () => {
    const items = groupNotificationsBySection([make('a', at(0)), make('b', at(5))], NOW);
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('getRelativeAge', () => {
  it('returns now under one minute', () => {
    expect(getRelativeAge(new Date(NOW.getTime() - 30_000), NOW)).toEqual({ unit: 'now' });
  });

  it('returns minutes under one hour', () => {
    expect(getRelativeAge(new Date(NOW.getTime() - 5 * 60_000), NOW)).toEqual({ unit: 'minutes', value: 5 });
    expect(getRelativeAge(new Date(NOW.getTime() - 59 * 60_000), NOW)).toEqual({ unit: 'minutes', value: 59 });
  });

  it('returns whole hours beyond one hour', () => {
    expect(getRelativeAge(new Date(NOW.getTime() - 61 * 60_000), NOW)).toEqual({ unit: 'hours', value: 1 });
    expect(getRelativeAge(new Date(NOW.getTime() - 5 * 3600_000), NOW)).toEqual({ unit: 'hours', value: 5 });
  });

  it('treats future dates as now', () => {
    expect(getRelativeAge(new Date(NOW.getTime() + 60_000), NOW)).toEqual({ unit: 'now' });
  });
});
