import { groupInboxByDate } from '@/utils/inboxGroups';
import { routeForAction } from '@/utils/notificationRoutes';

// Wednesday 15 Oct 2026, 10:00 local time
const NOW = new Date(2026, 9, 15, 10, 0, 0);
const at = (y: number, m: number, d: number, h = 12) => ({ createdAt: new Date(y, m, d, h).toISOString() });

describe('groupInboxByDate', () => {
  it('buckets by local calendar day and keeps order', () => {
    const items = [
      { id: 'a', ...at(2026, 9, 15, 9) },
      { id: 'b', ...at(2026, 9, 15, 0) },
      { id: 'c', ...at(2026, 9, 14, 23) },
      { id: 'd', ...at(2026, 9, 9, 8) },
      { id: 'e', ...at(2026, 9, 8, 23) },
    ];
    const sections = groupInboxByDate(items, NOW);
    expect(sections.map((s) => s.key)).toEqual(['today', 'yesterday', 'week', 'older']);
    expect(sections[0].data.map((i) => i.id)).toEqual(['a', 'b']);
    expect(sections[1].data.map((i) => i.id)).toEqual(['c']);
    expect(sections[2].data.map((i) => i.id)).toEqual(['d']);
    expect(sections[3].data.map((i) => i.id)).toEqual(['e']);
  });

  it('drops empty sections', () => {
    const sections = groupInboxByDate([{ id: 'x', ...at(2026, 0, 1) }], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('older');
  });

  it('puts future timestamps in today and invalid dates in older', () => {
    const sections = groupInboxByDate(
      [{ id: 'f', ...at(2026, 9, 16) }, { id: 'bad', createdAt: 'not-a-date' }],
      NOW,
    );
    expect(sections.map((s) => [s.key, s.data.map((i) => i.id)])).toEqual([
      ['today', ['f']],
      ['older', ['bad']],
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(groupInboxByDate([], NOW)).toEqual([]);
  });
});

describe('routeForAction', () => {
  it('maps known actions', () => {
    expect(routeForAction('open_plan')).toBe('/plan');
    expect(routeForAction('open_messages')).toBe('/(tabs)/messages');
    expect(routeForAction('open_notifications')).toBe('/admin-notifications');
    expect(routeForAction('open_deals')).toBe('/deals');
  });

  it('returns null for unknown or empty actions', () => {
    expect(routeForAction('open_nowhere')).toBeNull();
    expect(routeForAction('toString')).toBeNull();
    expect(routeForAction(null)).toBeNull();
    expect(routeForAction(undefined)).toBeNull();
  });
});
