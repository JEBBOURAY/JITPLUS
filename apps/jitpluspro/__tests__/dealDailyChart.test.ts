import { dailyViews } from '@/components/deals/DealDailyChart';

describe('dailyViews', () => {
  const daily = [
    { day: '2026-10-08', views: 4, actions: 1, claims: 0 },
    { day: '2026-10-10', views: 7, actions: 0, claims: 2 },
  ];

  it('fills the days without activity with zero', () => {
    expect(dailyViews(daily, '2026-10-08', '2026-10-11')).toEqual([
      { day: '2026-10-08', views: 4 },
      { day: '2026-10-09', views: 0 },
      { day: '2026-10-10', views: 7 },
      { day: '2026-10-11', views: 0 },
    ]);
  });

  it('keeps the last 14 days of a longer period, and one day at least', () => {
    const days = dailyViews(daily, '2026-09-01', '2026-10-10');
    expect(days).toHaveLength(14);
    expect(days[0].day).toBe('2026-09-27');
    expect(days[13]).toEqual({ day: '2026-10-10', views: 7 });
    expect(dailyViews([], '2026-10-10', '2026-10-08')).toEqual([{ day: '2026-10-08', views: 0 }]);
  });
});
