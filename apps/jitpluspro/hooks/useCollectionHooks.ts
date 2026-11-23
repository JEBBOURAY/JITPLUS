import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type {
  CollectionCheckResult,
  CollectionDetail,
  CollectionDto,
  CollectionInput,
  CollectionListItem,
  TillCollection,
} from '@jitplus/shared/src/collection';
import { scratchKeys } from './useScratchHooks';
import { STALE } from './queries/keys';

const collectionKeys = {
  all: ['collections'] as const,
  list: ['collections', 'list'] as const,
  details: ['collections', 'detail'] as const,
  detail: (id: string) => ['collections', 'detail', id] as const,
  till: (clientId: string) => ['collections', 'till', clientId] as const,
} as const;

const BASE = '/collections/merchant';

export function useCollections(enabled = true) {
  return useQuery<CollectionListItem[]>({
    queryKey: collectionKeys.list,
    queryFn: async () => {
      const res = await api.get(BASE);
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: STALE.SHORT,
    enabled,
  });
}

export function useCollection(id: string | undefined, enabled = true) {
  return useQuery<CollectionDetail>({
    queryKey: collectionKeys.detail(id ?? ''),
    queryFn: async () => (await api.get(`${BASE}/${id}`)).data,
    enabled: !!id && enabled,
    staleTime: STALE.FAST,
  });
}

/** The running collection other than `id`, if any: only one can run at a time, so launching `id` would be refused. */
export function useOtherActiveCollection(id: string | undefined, enabled = true) {
  const { data } = useCollections(enabled);
  return data?.find((c) => c.status === 'ACTIVE' && c.id !== id);
}

/** Every write changes the list, a detail and what the till shows. */
function useCollectionMutation<TVars, TData>(mutationFn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionKeys.all }),
  });
}

export function useCreateCollection() {
  return useCollectionMutation(async (input: CollectionInput) => (await api.post<CollectionDto>(BASE, input)).data);
}

export function useUpdateCollection() {
  return useCollectionMutation(async ({ id, ...input }: CollectionInput & { id: string }) =>
    (await api.put<CollectionDto>(`${BASE}/${id}`, input)).data);
}

export function useActivateCollection() {
  return useCollectionMutation(async (id: string) => (await api.post<CollectionDetail>(`${BASE}/${id}/activate`)).data);
}

export function useEndCollection() {
  return useCollectionMutation(async (id: string) => (await api.post<CollectionDetail>(`${BASE}/${id}/end`)).data);
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/${id}`)).data,
    // The detail screen of the deleted collection is still mounted: refetching it would only 404.
    onSuccess: (_data, id) => {
      const deleted = collectionKeys.detail(id);
      qc.invalidateQueries({
        queryKey: collectionKeys.all,
        predicate: (q) => !deleted.every((part, i) => q.queryKey[i] === part),
      });
    },
  });
}

/** The open collection for the client at the till; `null` when there is nothing to show. */
export async function fetchTillCollection(clientId: string): Promise<TillCollection | null> {
  return (await api.get<{ collection: TillCollection | null }>(`${BASE}/clients/${clientId}`)).data.collection ?? null;
}

export function prefetchTillCollection(qc: QueryClient, clientId: string) {
  return qc.prefetchQuery({ queryKey: collectionKeys.till(clientId), queryFn: () => fetchTillCollection(clientId), staleTime: STALE.TILL });
}

export function useTillCollection(clientId: string | undefined) {
  return useQuery<TillCollection | null>({
    queryKey: collectionKeys.till(clientId ?? ''),
    queryFn: () => fetchTillCollection(clientId!),
    enabled: !!clientId,
    staleTime: STALE.TILL,
  });
}

/** Ticks the products bought during the visit. The key makes a retry a no-op. */
export function useCheckCollectionItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, itemIds, idempotencyKey }: { clientId: string; itemIds: string[]; idempotencyKey: string }) =>
      (await api.post<CollectionCheckResult>(
        `${BASE}/checks`,
        { clientId, itemIds },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )).data,
    onSuccess: (data, vars) => {
      qc.setQueryData(collectionKeys.till(vars.clientId), data.collection);
      // List and detail show per-product counts and gifts won.
      qc.invalidateQueries({ queryKey: collectionKeys.list });
      qc.invalidateQueries({ queryKey: collectionKeys.details });
      // A completed collection created a gift coupon.
      if (data.gift) qc.invalidateQueries({ queryKey: scratchKeys.couponsAll });
    },
  });
}
