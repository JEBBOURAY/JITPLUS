import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { ClientDetail } from '@/types';
import { queryKeys, STALE, GC } from './keys';

export function useClientDetail(id: string | undefined, enabled = true) {
  return useQuery<ClientDetail>({
    queryKey: queryKeys.clientDetail(id ?? ''),
    queryFn: async () => {
      const res = await api.get(`/merchant/client/${id}/detail`);
      return res.data;
    },
    staleTime: STALE.SHORT,
    gcTime: GC.SHORT,
    enabled: !!id && enabled,
  });
}

export function useAdjustStamps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { clientId: string; stamps: number; note?: string }) => {
      const res = await api.post('/merchant/transactions/adjust', payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.clientDetail(variables.clientId) });
      qc.invalidateQueries({ queryKey: queryKeys.clientStatus(variables.clientId) });
    },
  });
}
