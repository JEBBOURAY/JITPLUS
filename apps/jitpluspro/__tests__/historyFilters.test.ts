import { DEFAULT_TRANSACTION_FILTERS, hasActiveFilters, periodStart, sheetFilterCount, transactionParams } from '@/utils/historyFilters';
import { countForm } from '@/utils/countForm';

// Wednesday 2026-11-18, 15:30 local time.
const NOW = new Date(2026, 10, 18, 15, 30);

describe('periodStart', () => {
  it('starts each period at local midnight, today included', () => {
    expect(periodStart('today', NOW)).toEqual(new Date(2026, 10, 18));
    expect(periodStart('week', NOW)).toEqual(new Date(2026, 10, 12));
    expect(periodStart('month', NOW)).toEqual(new Date(2026, 9, 20));
    expect(periodStart('thisMonth', NOW)).toEqual(new Date(2026, 10, 1));
    expect(periodStart('all', NOW)).toBeNull();
  });

  it('crosses a month and a year boundary', () => {
    expect(periodStart('week', new Date(2027, 0, 3, 9))).toEqual(new Date(2026, 11, 28));
  });
});

describe('transactionParams', () => {
  it('sends nothing for the default filters (same request as older versions)', () => {
    expect(transactionParams(DEFAULT_TRANSACTION_FILTERS, NOW)).toEqual({});
  });

  it('sends only the filters that are set, search trimmed', () => {
    expect(transactionParams({ kind: 'rewards', period: 'today', staff: 'owner', search: '  sara ' }, NOW)).toEqual({
      kind: 'rewards',
      from: new Date(2026, 10, 18).toISOString(),
      staff: 'owner',
      search: 'sara',
    });
    expect(transactionParams({ ...DEFAULT_TRANSACTION_FILTERS, search: '   ' }, NOW)).toEqual({});
  });
});

describe('filter counters', () => {
  it('counts only the sheet filters on the button badge', () => {
    expect(sheetFilterCount({ kind: 'stamps', period: 'week', staff: 'tm-1', search: 'x' })).toBe(2);
    expect(sheetFilterCount(DEFAULT_TRANSACTION_FILTERS)).toBe(0);
  });

  it('knows when anything narrows the list', () => {
    expect(hasActiveFilters(DEFAULT_TRANSACTION_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_TRANSACTION_FILTERS, kind: 'cancelled' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_TRANSACTION_FILTERS, search: 'sa' })).toBe(true);
  });
});

describe('countForm', () => {
  it('follows the Darija counting forms', () => {
    expect([0, 1, 2, 10, 11, 150].map(countForm)).toEqual(['Other', 'One', 'Few', 'Few', 'Other', 'Other']);
  });
});
