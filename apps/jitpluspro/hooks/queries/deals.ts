import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import i18n from '@/i18n';
import { ALLOWED_LOGO_MIMES } from '@/constants/app';
import type { DealInput, MerchantDealDto, MerchantDealListResponse } from '@jitplus/shared/src/deals';
import type { DealPatch } from '@/components/deals/dealForm';
import { queryKeys, STALE } from './keys';
import { MAX_UPLOAD_SIZE_BYTES, normalizeUploadMimeAndExt, uploadImageNative } from './upload';

const BASE = '/merchant/deals';

export function useMerchantDeals(enabled = true) {
  return useQuery<MerchantDealListResponse>({
    queryKey: queryKeys.merchantDeals,
    queryFn: async () => {
      const data = (await api.get<MerchantDealListResponse>(BASE)).data;
      return { deals: Array.isArray(data?.deals) ? data.deals : [], limits: data.limits };
    },
    staleTime: STALE.SHORT,
    enabled,
  });
}

export function useMerchantDeal(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery<MerchantDealDto>({
    queryKey: queryKeys.merchantDeal(id ?? ''),
    queryFn: async () => (await api.get<MerchantDealDto>(`${BASE}/${id}`)).data,
    enabled: !!id,
    staleTime: STALE.FAST,
    // The list row already holds the whole deal: the detail opens at once.
    placeholderData: () =>
      qc.getQueryData<MerchantDealListResponse>(queryKeys.merchantDeals)?.deals.find((d) => d.id === id),
  });
}

/** Stores the returned deal and refreshes the list (and its limits). */
function useDealSaved() {
  const qc = useQueryClient();
  return (deal?: MerchantDealDto) => {
    if (deal?.id) qc.setQueryData(queryKeys.merchantDeal(deal.id), deal);
    qc.invalidateQueries({ queryKey: queryKeys.merchantDeals, exact: true });
  };
}

export function useCreateDeal() {
  const saved = useDealSaved();
  return useMutation({
    mutationFn: async (payload: DealInput) => (await api.post<MerchantDealDto>(BASE, payload)).data,
    onSuccess: saved,
  });
}

export function useUpdateDeal() {
  const saved = useDealSaved();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: DealPatch }) =>
      (await api.patch<MerchantDealDto>(`${BASE}/${id}`, payload)).data,
    onSuccess: saved,
  });
}

export function useStopDeal() {
  const saved = useDealSaved();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<MerchantDealDto>(`${BASE}/${id}/stop`)).data,
    onSuccess: saved,
  });
}

export function useDuplicateDeal() {
  const saved = useDealSaved();
  return useMutation({
    mutationFn: async ({ id, startsOn, endsOn }: { id: string; startsOn?: string; endsOn?: string }) =>
      (await api.post<MerchantDealDto>(`${BASE}/${id}/duplicate`, { startsOn, endsOn })).data,
    onSuccess: saved,
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/${id}`)).data,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.merchantDeal(id) });
      qc.invalidateQueries({ queryKey: queryKeys.merchantDeals, exact: true });
    },
  });
}

export function useUploadDealImage() {
  return useMutation({
    mutationFn: async (asset: { uri: string; mimeType?: string | null }) => {
      const { mime } = normalizeUploadMimeAndExt(asset.uri, asset.mimeType);
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
      }
      const res = await uploadImageNative({
        uri: asset.uri,
        endpoint: '/merchant/upload-image?type=deal',
        mime,
        maxBytes: MAX_UPLOAD_SIZE_BYTES,
      });
      return res as { url: string };
    },
  });
}
