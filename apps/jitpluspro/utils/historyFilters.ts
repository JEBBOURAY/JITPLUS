import type { TransactionFilters, TransactionPeriod } from '@/types';

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  kind: 'all',
  period: 'all',
  staff: null,
  search: '',
};

/**
 * First instant of a period, at the device's local midnight (the merchant's day, not UTC).
 * "7 days" and "30 days" include today. Null = no lower bound.
 */
export function periodStart(period: TransactionPeriod, now: Date = new Date()): Date | null {
  const midnight = (daysAgo: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  switch (period) {
    case 'today':
      return midnight(0);
    case 'week':
      return midnight(6);
    case 'month':
      return midnight(29);
    case 'thisMonth':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    default:
      return null;
  }
}

/** Query params of GET /merchant/transactions; filters left at their default are not sent. */
export function transactionParams(f: TransactionFilters, now: Date = new Date()) {
  const from = periodStart(f.period, now);
  const search = f.search.trim();
  return {
    ...(f.kind !== 'all' && { kind: f.kind }),
    ...(from && { from: from.toISOString() }),
    ...(f.staff && { staff: f.staff }),
    ...(search && { search }),
  };
}

/** Filters set in the sheet (period, staff), for the badge on the filter button. */
export function sheetFilterCount(f: TransactionFilters): number {
  return (f.period !== 'all' ? 1 : 0) + (f.staff ? 1 : 0);
}

export function hasActiveFilters(f: TransactionFilters): boolean {
  return f.kind !== 'all' || sheetFilterCount(f) > 0 || f.search.trim() !== '';
}
