/**
 * React Query hooks for the collection game (client app).
 * Real-time invalidation is wired in useRealtimeEvents (COLLECTION_UPDATED)
 * and via FCM data payloads.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { ClientCollection, ClientCollectionsOverview } from '@jitplus/shared/src/collection';

const collectionKeys = {
  merchant: (merchantId: string) => ['collection', 'merchant', merchantId] as const,
  mine: ['collection', 'mine'] as const,
} as const;

/** The collection shown on a merchant page. Signed-in clients only (it carries their progress). */
export function useMerchantCollection(merchantId: string | undefined, enabled = true) {
  return useQuery<ClientCollection | null>({
    queryKey: collectionKeys.merchant(merchantId ?? ''),
    queryFn: () => api.getMerchantCollection(merchantId!),
    staleTime: 30 * 1000,
    enabled: !!merchantId && enabled,
  });
}

/** Home tile and collections screen: every open collection of the client's shops, and the gifts won. */
export function useMyCollections(enabled = true) {
  return useQuery<ClientCollectionsOverview>({
    queryKey: collectionKeys.mine,
    queryFn: () => api.getMyCollections(),
    staleTime: 30 * 1000,
    enabled,
  });
}

/** After a tick at the till or a gift used: the merchant page (when known) and the overview. */
export function invalidateCollections(queryClient: QueryClient, merchantId?: string) {
  if (merchantId) queryClient.invalidateQueries({ queryKey: collectionKeys.merchant(merchantId) });
  queryClient.invalidateQueries({ queryKey: collectionKeys.mine });
}
