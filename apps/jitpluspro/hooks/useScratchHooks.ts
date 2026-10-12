import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import api from '@/services/api';
import type {
  AudienceEstimate,
  CancelPreview,
  ClientCouponAtTill,
  CouponCheckResult,
  CouponRedeemResult,
  MerchantCouponsPage,
  ScratchAudienceType,
  ScratchCampaignDto,
  ScratchCampaignInput,
  ScratchCampaignListItem,
  ScratchCampaignStats,
  ScratchClientWithoutApp,
} from '@jitplus/shared/src/scratch';
import { queryKeys } from './useQueryHooks';

export const scratchKeys = {
  campaigns: ['scratch', 'campaigns'] as const,
  campaign: (id: string) => ['scratch', 'campaign', id] as const,
  statsAll: ['scratch', 'stats'] as const,
  stats: (id: string) => ['scratch', 'stats', id] as const,
  withoutApp: (id: string) => ['scratch', 'without-app', id] as const,
  cancelPreview: (id: string) => ['scratch', 'cancel-preview', id] as const,
  audience: (type: ScratchAudienceType, value: number | null) => ['scratch', 'audience', type, value] as const,
  couponsAll: ['scratch', 'coupons'] as const,
  coupons: (status: string, campaignId?: string) => ['scratch', 'coupons', status, campaignId ?? 'all'] as const,
  // Under couponsAll so a redemption refreshes it.
  clientCoupons: (clientId: string) => ['scratch', 'coupons', 'client', clientId] as const,
} as const;

const BASE = '/scratch/merchant';

function useInvalidateCampaign() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: scratchKeys.campaigns });
    if (id) {
      qc.invalidateQueries({ queryKey: scratchKeys.campaign(id) });
      qc.invalidateQueries({ queryKey: scratchKeys.stats(id) });
    }
  };
}

// ── Campaigns ───────────────────────────────────────────────────

export function useScratchCampaigns(enabled = true) {
  return useQuery<ScratchCampaignListItem[]>({
    queryKey: scratchKeys.campaigns,
    queryFn: async () => {
      const res = await api.get(`${BASE}/campaigns`);
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: 60 * 1000,
    enabled,
  });
}

/** Refresh interval while the cards are still being sent. */
const SENDING_POLL_MS = 10_000;

export function useScratchCampaign(id: string | undefined) {
  return useQuery<ScratchCampaignDto>({
    queryKey: scratchKeys.campaign(id ?? ''),
    queryFn: async () => (await api.get(`${BASE}/campaigns/${id}`)).data,
    enabled: !!id,
    staleTime: 30 * 1000,
    refetchInterval: (query) => (query.state.data?.status === 'SENDING' ? SENDING_POLL_MS : false),
  });
}

export function useScratchCampaignStats(id: string | undefined, enabled = true, polling = false) {
  return useQuery<ScratchCampaignStats>({
    queryKey: scratchKeys.stats(id ?? ''),
    queryFn: async () => (await api.get(`${BASE}/campaigns/${id}/stats`)).data,
    enabled: !!id && enabled,
    staleTime: 30 * 1000,
    refetchInterval: polling ? SENDING_POLL_MS : false,
  });
}

export function useScratchClientsWithoutApp(id: string | undefined, enabled = true) {
  return useQuery<ScratchClientWithoutApp[]>({
    queryKey: scratchKeys.withoutApp(id ?? ''),
    queryFn: async () => {
      const res = await api.get(`${BASE}/campaigns/${id}/clients-without-app`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!id && enabled,
    staleTime: 60 * 1000,
  });
}

export function useScratchAudienceEstimate(type: ScratchAudienceType, value: number | null, enabled = true) {
  return useQuery<AudienceEstimate>({
    queryKey: scratchKeys.audience(type, value),
    queryFn: async () =>
      (await api.post(`${BASE}/audience/estimate`, { audienceType: type, audienceValue: value ?? undefined })).data,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCreateScratchCampaign() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async (payload: ScratchCampaignInput) =>
      (await api.post<ScratchCampaignDto>(`${BASE}/campaigns`, payload)).data,
    onSuccess: (data) => invalidate(data?.id),
  });
}

export function useUpdateScratchCampaign() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ScratchCampaignInput }) =>
      (await api.put<ScratchCampaignDto>(`${BASE}/campaigns/${id}`, payload)).data,
    onSuccess: (_data, vars) => invalidate(vars.id),
  });
}

export function useScheduleScratchCampaign() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async ({ id, sendAt }: { id: string; sendAt?: string }) =>
      (await api.post<ScratchCampaignDto & { audience: AudienceEstimate }>(`${BASE}/campaigns/${id}/schedule`, sendAt ? { sendAt } : {})).data,
    onSuccess: (_data, vars) => invalidate(vars.id),
  });
}

export function useUnscheduleScratchCampaign() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<ScratchCampaignDto>(`${BASE}/campaigns/${id}/status`, { status: 'DRAFT' })).data,
    onSuccess: (_data, id) => invalidate(id),
  });
}

/** Always fresh: the counts shown before cancelling must be current. */
export function fetchCancelPreview(qc: QueryClient, id: string): Promise<CancelPreview> {
  return qc.fetchQuery<CancelPreview>({
    queryKey: scratchKeys.cancelPreview(id),
    queryFn: async () => (await api.get(`${BASE}/campaigns/${id}/cancel-preview`)).data,
    staleTime: 0,
  });
}

export function useCancelScratchCampaign() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch(`${BASE}/campaigns/${id}/status`, { status: 'CANCELLED' })).data,
    onSuccess: (_data, id) => invalidate(id),
  });
}

export function useExtendScratchDates() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async ({ id, cardExpiresOn, couponExpiresOn }: { id: string; cardExpiresOn?: string; couponExpiresOn?: string }) =>
      (await api.patch<ScratchCampaignDto>(`${BASE}/campaigns/${id}/dates`, { cardExpiresOn, couponExpiresOn })).data,
    onSuccess: (_data, vars) => invalidate(vars.id),
  });
}

export function useDuplicateScratchCampaign() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<ScratchCampaignDto>(`${BASE}/campaigns/${id}/duplicate`)).data,
    onSuccess: (data) => invalidate(data?.id),
  });
}

export function useDeleteScratchCampaign() {
  const invalidate = useInvalidateCampaign();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/campaigns/${id}`)).data,
    onSuccess: () => invalidate(),
  });
}

/** Fresh WhatsApp claim link for a client who has not installed JitPlus yet. */
export function useReshareClaim() {
  return useMutation({
    mutationFn: async (clientId: string) =>
      (await api.post<{ claim: { url: string; expiresAt: string }; client: { id: string; telephone: string; prenom: string | null } }>(
        `/merchant/clients/${clientId}/reshare-claim`,
      )).data,
  });
}

// ── Coupons at the till ─────────────────────────────────────────

export function useCheckCoupon() {
  return useMutation({
    mutationFn: async (input: { token?: string; code?: string }) =>
      (await api.post<CouponCheckResult>(`${BASE}/coupons/check`, input)).data,
  });
}

export function useClientCouponsAtTill(clientId: string | undefined) {
  return useQuery<ClientCouponAtTill[]>({
    queryKey: scratchKeys.clientCoupons(clientId ?? ''),
    queryFn: async () => {
      const res = await api.get(`${BASE}/clients/${clientId}/coupons`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!clientId,
    staleTime: 0,
  });
}

export function useRedeemCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ couponId, purchaseAmount, idempotencyKey }: {
      couponId: string;
      purchaseAmount: number;
      clientId?: string;
      idempotencyKey?: string;
    }) =>
      (await api.post<CouponRedeemResult>(
        `${BASE}/coupons/${couponId}/redeem`,
        { purchaseAmount },
        { headers: { 'Idempotency-Key': idempotencyKey ?? Crypto.randomUUID() } },
      )).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: scratchKeys.couponsAll });
      qc.invalidateQueries({ queryKey: scratchKeys.campaigns });
      qc.invalidateQueries({ queryKey: queryKeys.transactions });
      qc.invalidateQueries({ queryKey: queryKeys.homeStats });
      if (vars.clientId) {
        qc.invalidateQueries({ queryKey: queryKeys.clientDetail(vars.clientId) });
        qc.invalidateQueries({ queryKey: queryKeys.clientStatus(vars.clientId) });
      }
    },
  });
}

export function useMerchantCoupons(status: 'REDEEMED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED', campaignId?: string, enabled = true) {
  return useInfiniteQuery<MerchantCouponsPage>({
    queryKey: scratchKeys.coupons(status, campaignId),
    queryFn: async ({ pageParam }) =>
      (await api.get(`${BASE}/coupons`, { params: { status, campaignId, page: pageParam } })).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled,
    staleTime: 30 * 1000,
  });
}
