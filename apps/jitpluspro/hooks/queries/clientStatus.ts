import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { randomUUID } from '@/utils/crypto';
import api from '@/services/api';
import type { CustomerStatus, RecordTransactionPayload } from '@/types';
import { queryKeys, STALE, GC } from './keys';
import { fetchRewards } from './rewards';
import { fetchLuckyWheelActiveInfo, fetchLuckyWheelClientPrizes } from './luckyWheel';
import { prefetchClientCouponsAtTill } from '../useScratchHooks';
import { prefetchTillCollection } from '../useCollectionHooks';
import { invalidateAfterTransaction, markLocalTransaction } from './transactionCache';

async function fetchClientStatus(clientId: string, scanTicket?: string): Promise<CustomerStatus> {
  const res = await api.get(`/merchant/client/${clientId}/status`, {
    headers: scanTicket ? { 'X-Scan-Ticket': scanTicket } : undefined,
  });
  return res.data;
}

export function useClientStatus(clientId: string | undefined, scanTicket?: string) {
  return useQuery<CustomerStatus>({
    queryKey: queryKeys.clientStatus(clientId ?? ''),
    queryFn: () => fetchClientStatus(clientId!, scanTicket),
    staleTime: STALE.FAST,
    gcTime: GC.FAST,
    enabled: !!clientId,
  });
}

/** Starts the till-screen client fetch while the scan screen is still animating. */
export function prefetchClientStatus(qc: QueryClient, clientId: string, scanTicket?: string) {
  // The till sections (prizes, coupons, collection) load with the card instead of
  // popping in after the screen opened.
  void Promise.allSettled([
    qc.prefetchQuery({
      queryKey: queryKeys.luckyWheelClientPrizes(clientId),
      queryFn: () => fetchLuckyWheelClientPrizes(clientId),
      staleTime: STALE.TILL,
    }),
    prefetchClientCouponsAtTill(qc, clientId),
    prefetchTillCollection(qc, clientId),
  ]);
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
      invalidateAfterTransaction(qc, variables.clientId);
      // Stamps given from a booking change that booking (arrived or closed, stamps given).
      if (variables.bookingId) {
        qc.invalidateQueries({ queryKey: queryKeys.booking(variables.bookingId) });
        qc.invalidateQueries({ queryKey: queryKeys.bookingAgendaRoot });
      }
    },
  });
}
