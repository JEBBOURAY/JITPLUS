import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { ClientDetail } from '@/types';
import { queryKeys, STALE, GC } from './keys';
import { invalidateAfterTransaction, markLocalTransaction } from './transactionCache';

export function useClientDetail(id: string | undefined) {
  return useQuery<ClientDetail>({
    queryKey: queryKeys.clientDetail(id ?? ''),
    queryFn: async () => {
      const res = await api.get(`/merchant/client/${id}/detail`);
      return res.data;
    },
    staleTime: STALE.SHORT,
    gcTime: GC.SHORT,
    enabled: !!id,
  });
}

export function useAdjustStamps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { clientId: string; stamps: number; note?: string }) => {
      markLocalTransaction(payload.clientId);
      const res = await api.post('/merchant/transactions/adjust', payload);
      return res.data;
    },
    // An adjustment is a transaction: it shows in the history and the home stats.
    onSuccess: (_data, variables) => invalidateAfterTransaction(qc, variables.clientId),
  });
}
