import { useCallback } from 'react';
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import api from '@/services/api';
import type { ClientListSort, ClientListView, ClientSegments, ClientsPage } from '@/types';
import { queryKeys, STALE } from './keys';

/** Whether the merchant has at least one client: a one-row probe, for the "Démarrage" guide. */
export function useHasClients(enabled = true) {
  return useQuery<boolean>({
    queryKey: queryKeys.clientsExist,
    queryFn: async () => {
      const res = await api.get('/merchant/clients', { params: { page: 1, limit: 1 } });
      const data = res.data;
      if (Array.isArray(data)) return data.length > 0;
      return (data?.pagination?.total ?? data?.clients?.length ?? 0) > 0;
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

const CLIENTS_PAGE_SIZE = 30;

/**
 * Paginated client list for the Clients tab (infinite scroll).
 * `reload` drops the extra pages before refetching, so a refresh costs one request.
 */
export function useClientList(search: string, view: ClientListView, sort: ClientListSort | null = null) {
  const qc = useQueryClient();
  const query = useInfiniteQuery<ClientsPage>({
    queryKey: queryKeys.clientList(search, view, sort),
    queryFn: async ({ pageParam }) => {
      const term = search.trim();
      const res = await api.get('/merchant/clients', {
        params: {
          page: pageParam,
          limit: CLIENTS_PAGE_SIZE,
          ...(term && { search: term }),
          ...(view !== 'all' && { view }),
          ...(sort && { sort }),
        },
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: ({ pagination }) =>
      pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
    staleTime: STALE.MEDIUM,
    // Keep results on screen while the search term changes, but not across views or sorts:
    // showing the previous filter's clients under a new filter would be misleading.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === view && previousQuery?.queryKey[3] === (sort ?? '') ? previous : undefined,
  });

  const { refetch } = query;
  const reload = useCallback(async () => {
    qc.setQueryData<InfiniteData<ClientsPage>>(queryKeys.clientList(search, view, sort), (old) =>
      old && { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) },
    );
    await refetch();
  }, [qc, refetch, search, view, sort]);

  /** For screen focus: tabs stay mounted, so React Query never refetches them on its own. */
  const reloadIfStale = useCallback(() => {
    const cached = qc.getQueryCache().find({ queryKey: queryKeys.clientList(search, view, sort), exact: true });
    if (cached?.state.data && cached.state.fetchStatus === 'idle' && cached.isStale()) {
      reload().catch(() => {});
    }
  }, [qc, reload, search, view, sort]);

  return { query, reload, reloadIfStale };
}

/** Size of each chip of the Clients tab (all plans, team included). Older APIs answer 404: no counts shown. */
export function useClientSegments() {
  return useQuery<ClientSegments>({
    queryKey: queryKeys.clientSegments,
    queryFn: async () => {
      const res = await api.get('/merchant/clients/segments');
      return res.data;
    },
    staleTime: STALE.MEDIUM,
    retry: false,
  });
}
