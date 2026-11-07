import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { queryKeys, STALE } from './keys';

const BASE = '/stamp-codes/merchant';

type StampCodeStatus = 'ACTIVE' | 'REDEEMED' | 'REVOKED';

interface StampCodeQuota {
  used: number;
  /** null on the Pro plan: unlimited */
  limit: number | null;
  remaining: number | null;
}

export interface StampCodeBatchSummary {
  batchId: string;
  label: string;
  stamps: number;
  amount: number;
  createdAt: string;
  total: number;
  redeemed: number;
  revoked: number;
  active: number;
}

export interface StampCodeItem {
  id: string;
  status: StampCodeStatus;
  /** Link encoded in the QR code, only for codes still usable */
  url: string | null;
  redeemedAt: string | null;
  redeemedBy: { prenom: string | null; nom: string | null } | null;
}

interface StampCodeBatchDetail extends StampCodeBatchSummary {
  codes: StampCodeItem[];
}

interface CreateStampCodeBatchInput {
  label: string;
  quantity: number;
  stamps?: number;
  amount?: number;
}

export function useStampCodeQuota(enabled = true) {
  return useQuery<StampCodeQuota>({
    queryKey: queryKeys.stampCodeQuota,
    queryFn: async () => (await api.get<StampCodeQuota>(`${BASE}/quota`)).data,
    staleTime: STALE.SHORT,
    enabled,
  });
}

const BATCHES_PAGE_SIZE = 20;

/** Most recent batches first, page by page (same paging as useTransactions). */
export function useStampCodeBatches(enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.stampCodeBatches,
    queryFn: async ({ pageParam }) => {
      const data = (await api.get<{ batches: StampCodeBatchSummary[] }>(`${BASE}/batches`, {
        params: { page: pageParam, limit: BATCHES_PAGE_SIZE },
      })).data;
      return Array.isArray(data?.batches) ? data.batches : [];
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === BATCHES_PAGE_SIZE ? lastPageParam + 1 : undefined,
    staleTime: STALE.FAST,
    enabled,
  });
}

export function useStampCodeBatch(batchId: string | undefined) {
  return useQuery<StampCodeBatchDetail>({
    queryKey: queryKeys.stampCodeBatch(batchId ?? ''),
    queryFn: async () => (await api.get<StampCodeBatchDetail>(`${BASE}/batches/${batchId}`)).data,
    enabled: !!batchId,
    staleTime: STALE.FAST,
  });
}

export function useCreateStampCodeBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStampCodeBatchInput) =>
      (await api.post<StampCodeBatchDetail>(`${BASE}/batches`, input)).data,
    // The response is the full batch: the detail screen opens without a refetch.
    onSuccess: (batch) => {
      qc.setQueryData(queryKeys.stampCodeBatch(batch.batchId), batch);
      qc.invalidateQueries({ queryKey: queryKeys.stampCodeBatches, exact: true });
      qc.invalidateQueries({ queryKey: queryKeys.stampCodeQuota, exact: true });
    },
  });
}

/** A revocation changes the list counts and the open batch detail (the quota is unchanged). */
function useRevoked() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.stampCodeBatches });
}

export function useRevokeStampCodeBatch() {
  const revoked = useRevoked();
  return useMutation({
    mutationFn: async (batchId: string) => (await api.post<{ revoked: number }>(`${BASE}/batches/${batchId}/revoke`)).data,
    onSuccess: revoked,
  });
}

export function useRevokeStampCode() {
  const revoked = useRevoked();
  return useMutation({
    mutationFn: async (codeId: string) => (await api.post<{ revoked: number }>(`${BASE}/codes/${codeId}/revoke`)).data,
    onSuccess: revoked,
  });
}
