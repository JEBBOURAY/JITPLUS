import { useQuery, keepPreviousData } from '@tanstack/react-query';
import api from '@/services/api';
import type { DashboardKpis, DashboardGames, RewardDistribution, TrendResponse } from '@/types';
import { queryKeys, STALE } from './keys';

export function useDashboardKpis(enabled = true) {
  return useQuery<DashboardKpis>({
    queryKey: queryKeys.dashboardKpis,
    queryFn: async () => {
      const res = await api.get('/merchant/dashboard-kpis');
      return res.data;
    },
    staleTime: STALE.LONG,
    enabled,
  });
}

export function useDashboardTrends(period: string, enabled = true) {
  return useQuery<TrendResponse>({
    queryKey: queryKeys.dashboardTrends(period),
    queryFn: async () => {
      const res = await api.get(`/merchant/dashboard-trends?period=${period}`);
      return res.data;
    },
    staleTime: STALE.LONG,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDashboardDistribution(enabled = true) {
  return useQuery<RewardDistribution>({
    queryKey: queryKeys.dashboardDistribution,
    queryFn: async () => {
      const res = await api.get('/merchant/dashboard-distribution');
      return res.data;
    },
    staleTime: STALE.LONG,
    enabled,
  });
}

export function useDashboardGames(enabled = true) {
  return useQuery<DashboardGames>({
    queryKey: queryKeys.dashboardGames,
    queryFn: async () => {
      const res = await api.get('/merchant/dashboard-games');
      return res.data;
    },
    staleTime: STALE.LONG,
    enabled,
  });
}
