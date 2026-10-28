import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type {
  WheelCampaign,
  WheelCampaignInput,
  WheelFulfilledDraw,
  WheelPendingDraw,
  WheelStatus,
} from '@/components/luckyWheel/types';
import { queryKeys, STALE } from './keys';

/** Status or stock changes also change what the cashier screen shows. */
function invalidateWheel(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.luckyWheelCampaigns });
  qc.invalidateQueries({ queryKey: queryKeys.luckyWheelActiveInfo });
}

export function useLuckyWheelCampaigns(enabled = true) {
  return useQuery<WheelCampaign[]>({
    queryKey: queryKeys.luckyWheelCampaigns,
    queryFn: async () => {
      const res = await api.get('/lucky-wheel/merchant/campaigns');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled,
    staleTime: STALE.MEDIUM,
  });
}

export function useLuckyWheelPendingPrizes(enabled = true) {
  return useQuery<WheelPendingDraw[]>({
    queryKey: queryKeys.luckyWheelPendingPrizes,
    queryFn: async () => {
      const res = await api.get('/lucky-wheel/merchant/pending-prizes');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled,
    staleTime: STALE.SHORT,
  });
}

export type LuckyWheelPendingDraw = WheelPendingDraw;

/** Prizes one client won and has not collected yet. Empty when the merchant has no Premium. */
export function useLuckyWheelClientPrizes(clientId: string | undefined) {
  return useQuery<LuckyWheelPendingDraw[]>({
    queryKey: [...queryKeys.luckyWheelPendingPrizes, clientId ?? ''],
    queryFn: async () => {
      try {
        const res = await api.get('/lucky-wheel/merchant/pending-prizes', { params: { clientId } });
        return Array.isArray(res.data) ? res.data : [];
      } catch (err) {
        if ((err as { response?: { status?: number } })?.response?.status === 403) return [];
        throw err;
      }
    },
    enabled: !!clientId,
    staleTime: 0,
  });
}

export function useLuckyWheelFulfilledPrizes(enabled = true) {
  return useQuery<WheelFulfilledDraw[]>({
    queryKey: queryKeys.luckyWheelFulfilledPrizes,
    queryFn: async () => {
      const res = await api.get('/lucky-wheel/merchant/fulfilled-prizes');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled,
    staleTime: STALE.SHORT,
  });
}

export function useCreateLuckyWheelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WheelCampaignInput) => {
      const res = await api.post('/lucky-wheel/merchant/campaigns', payload);
      return res.data as WheelCampaign;
    },
    onSuccess: () => invalidateWheel(qc),
  });
}

export function useUpdateLuckyWheelStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Exclude<WheelStatus, 'DRAFT'> }) => {
      const res = await api.patch(`/lucky-wheel/merchant/campaigns/${id}/status`, { status });
      return res.data as WheelCampaign;
    },
    onSuccess: () => invalidateWheel(qc),
  });
}

export function useUpdateLuckyWheelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<WheelCampaignInput>) => {
      const res = await api.patch(`/lucky-wheel/merchant/campaigns/${id}`, data);
      return res.data as WheelCampaign;
    },
    onSuccess: () => invalidateWheel(qc),
  });
}

export function useDeleteLuckyWheelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/lucky-wheel/merchant/campaigns/${id}`);
      return res.data;
    },
    onSuccess: () => invalidateWheel(qc),
  });
}

export function useFulfilLuckyWheelPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (drawId: string) => {
      const res = await api.post('/lucky-wheel/merchant/fulfil', { drawId });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.luckyWheelPendingPrizes });
      qc.invalidateQueries({ queryKey: queryKeys.luckyWheelFulfilledPrizes });
      invalidateWheel(qc);
    },
  });
}

export async function fetchLuckyWheelActiveInfo() {
  const res = await api.get('/lucky-wheel/merchant/active-info');
  return res.data as { hasActiveLuckyWheel: boolean; minSpendAmount: number; campaignName: string | null };
}

export function useLuckyWheelActiveInfo() {
  return useQuery({
    queryKey: queryKeys.luckyWheelActiveInfo,
    queryFn: fetchLuckyWheelActiveInfo,
    staleTime: STALE.SHORT,
  });
}
