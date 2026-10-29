import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import api from '@/services/api';
import type { TransactionsPage } from '@/types';
import { queryKeys, STALE } from './keys';

interface HomeStats {
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

export function useTransactions(enabled = true) {
  return useInfiniteQuery<TransactionsPage>({
    queryKey: queryKeys.transactions,
    queryFn: async ({ pageParam }) => {
      const res = await api.get(`/merchant/transactions?page=${pageParam}&limit=${TRANSACTIONS_PAGE_SIZE}`);
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.transactions.length === TRANSACTIONS_PAGE_SIZE ? (lastPageParam as number) + 1 : undefined,
    staleTime: STALE.SHORT,
    placeholderData: keepPreviousData,
    enabled,
  });
}
