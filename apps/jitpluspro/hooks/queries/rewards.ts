import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { Reward } from '@/types';
import { queryKeys, STALE } from './keys';

export async function fetchRewards(): Promise<Reward[]> {
  const res = await api.get('/rewards');
  return Array.isArray(res.data) ? res.data : [];
}

export function useRewards(enabled = true) {
  return useQuery<Reward[]>({
    queryKey: queryKeys.rewards,
    queryFn: fetchRewards,
    staleTime: STALE.MEDIUM,
    enabled,
  });
}
