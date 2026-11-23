import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { TransactionFilters, TransactionsPage } from '@/types';
import { DEFAULT_TRANSACTION_FILTERS, transactionParams } from '@/utils/historyFilters';
import { queryKeys, STALE } from './keys';

export interface HomeStats {
  today: { stamps: number; clients: number };
  yesterday: { stamps: number };
  month: { total: number; daily: number[] };
}

/** Aggregated Accueil KPI + month scans — computed server-side over ALL rows
 * (not just the first transactions page). All plans, team-accessible. */
export function useHomeStats(enabled = true) {
  return useQuery<HomeStats>({
    queryKey: queryKeys.homeStats,
    queryFn: async () => {
      const res = await api.get('/merchant/home-stats');
      return res.data;
    },
    staleTime: STALE.SHORT,
    enabled,
  });
}

const TRANSACTIONS_PAGE_SIZE = 20;

/**
 * History of the Transactions tab, page by page, for the given chips.
 * The period bound is computed when the page is fetched, so "today" follows midnight.
 */
export function useTransactions(filters: TransactionFilters = DEFAULT_TRANSACTION_FILTERS, enabled = true) {
  return useInfiniteQuery<TransactionsPage>({
    queryKey: queryKeys.transactionList(filters),
    queryFn: async ({ pageParam }) => {
      const res = await api.get('/merchant/transactions', {
        params: { page: pageParam, limit: TRANSACTIONS_PAGE_SIZE, ...transactionParams(filters) },
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.transactions.length === TRANSACTIONS_PAGE_SIZE ? (lastPageParam as number) + 1 : undefined,
    staleTime: STALE.SHORT,
    // Keep rows on screen while the search text changes, never across chips: the previous
    // filter's rows under a new chip would be misleading.
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey;
      const sameChips = key?.[2] === filters.kind && key?.[3] === filters.period && key?.[4] === (filters.staff ?? '');
      return sameChips ? previous : undefined;
    },
    enabled,
  });
}
