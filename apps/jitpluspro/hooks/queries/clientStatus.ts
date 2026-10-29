import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { randomUUID } from '@/utils/crypto';
import api from '@/services/api';
import type { CustomerStatus, RecordTransactionPayload } from '@/types';
import { queryKeys, STALE, GC } from './keys';
import { fetchRewards } from './rewards';
import { fetchLuckyWheelActiveInfo } from './luckyWheel';

async function fetchClientStatus(clientId: string, scanTicket?: string): Promise<CustomerStatus> {
  const res = await api.get(`/merchant/client/${clientId}/status`, {
    headers: scanTicket ? { 'X-Scan-Ticket': scanTicket } : undefined,
  });
  return res.data;
}

export function useClientStatus(clientId: string | undefined, enabled = true, scanTicket?: string) {
  return useQuery<CustomerStatus>({
    queryKey: queryKeys.clientStatus(clientId ?? ''),
    queryFn: () => fetchClientStatus(clientId!, scanTicket),
    staleTime: STALE.FAST,
    gcTime: GC.FAST,
    enabled: !!clientId && enabled,
  });
}

/** Starts the till-screen client fetch while the scan screen is still animating. */
export function prefetchClientStatus(qc: QueryClient, clientId: string, scanTicket?: string) {
  return qc.prefetchQuery({
    queryKey: queryKeys.clientStatus(clientId),
    queryFn: () => fetchClientStatus(clientId, scanTicket),
    staleTime: STALE.FAST,
    gcTime: GC.FAST,
  });
}

/** Merchant-wide data the till screen needs for every client. */
export function prefetchTillData(qc: QueryClient) {
  return Promise.allSettled([
    qc.prefetchQuery({ queryKey: queryKeys.rewards, queryFn: fetchRewards, staleTime: STALE.MEDIUM }),
    qc.prefetchQuery({ queryKey: queryKeys.luckyWheelActiveInfo, queryFn: fetchLuckyWheelActiveInfo, staleTime: STALE.SHORT }),
  ]);
}

// The socket echoes this device's own transactions back; the mutation already
// refreshed the client and the list, so the echo must not refetch them again.
// Keyed by client because the echo can arrive before the HTTP response.
const LOCAL_TX_ECHO_WINDOW_MS = 3000;
const localTxAt = new Map<string, number>();

function markLocalTransaction(clientId: string) {
  localTxAt.set(clientId, Date.now());
}

export function isLocalTransactionEcho(clientId: string): boolean {
  const at = localTxAt.get(clientId);
  if (at === undefined) return false;
  if (Date.now() - at > LOCAL_TX_ECHO_WINDOW_MS) {
    localTxAt.delete(clientId);
    return false;
  }
  return true;
}

export function useRecordTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RecordTransactionPayload) => {
      // Idempotency-Key: protects against double-submits (retry, double-tap,
      // flaky network). Generated client-side per submission; the backend
      // de-duplicates on (merchantId, idempotencyKey).
      const idempotencyKey = payload.idempotencyKey ?? randomUUID();
      const { idempotencyKey: _omit, scanTicket, ...body } = payload;
      if (payload.clientId) markLocalTransaction(payload.clientId);
      const res = await api.post('/merchant/transactions', body, {
        headers: {
          'Idempotency-Key': idempotencyKey,
          ...(scanTicket ? { 'X-Scan-Ticket': scanTicket } : {}),
        },
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      const clientId = variables.clientId;
      if (clientId) {
        markLocalTransaction(clientId);
        qc.invalidateQueries({ queryKey: queryKeys.clientStatus(clientId) });
        qc.invalidateQueries({ queryKey: queryKeys.clientDetail(clientId) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.transactions });
      // Only marks client lists stale; the Clients tab reloads them when it regains focus.
      qc.invalidateQueries({ queryKey: queryKeys.clientsRoot, refetchType: 'none' });
    },
  });
}
