import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { Store, CreateStorePayload } from '@/types';
import { queryKeys, STALE } from './keys';

export function useStores(enabled = true) {
  return useQuery<Store[]>({
    queryKey: queryKeys.stores,
    queryFn: async () => {
      const res = await api.get('/merchant/stores');
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateStorePayload) => {
      const res = await api.post('/merchant/stores', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<CreateStorePayload> }) => {
      const res = await api.patch(`/merchant/stores/${id}`, payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
  });
}

export function useDeleteStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/merchant/stores/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
  });
}
