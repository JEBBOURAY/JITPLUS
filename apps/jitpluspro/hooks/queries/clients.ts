import { useCallback } from 'react';
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  keepPreviousData,
  type InfiniteData,
} from '@tanstack/react-query';
import api from '@/services/api';
import type { ClientListItem, ClientListView, ClientsPage } from '@/types';
import { queryKeys, STALE } from './keys';

export function useClients(search: string, enabled = true) {
  return useQuery<ClientListItem[]>({
    queryKey: queryKeys.clients(search),
    queryFn: async () => {
      const res = await api.get('/merchant/clients', {
        params: search ? { search: search.trim() } : undefined,
      });
      const data = res.data;
      return Array.isArray(data) ? data : data?.clients ?? [];
    },
    staleTime: STALE.MEDIUM,
    placeholderData: keepPreviousData,
    enabled,
  });
}

const CLIENTS_PAGE_SIZE = 30;

/**
 * Paginated client list for the Clients tab (infinite scroll).
 * `reload` drops the extra pages before refetching, so a refresh costs one request.
 */
export function useClientList(search: string, view: ClientListView) {
  const qc = useQueryClient();
  const query = useInfiniteQuery<ClientsPage>({
    queryKey: queryKeys.clientList(search, view),
    queryFn: async ({ pageParam }) => {
      const term = search.trim();
      const res = await api.get('/merchant/clients', {
        params: {
          page: pageParam,
          limit: CLIENTS_PAGE_SIZE,
          ...(term && { search: term }),
          ...(view !== 'all' && { view }),
        },
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: ({ pagination }) =>
      pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
    staleTime: STALE.MEDIUM,
    // Keep results on screen while the search term changes, but not across views:
    // showing the previous filter's clients under a new filter would be misleading.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === view ? previous : undefined,
  });

  const { refetch } = query;
  const reload = useCallback(async () => {
    qc.setQueryData<InfiniteData<ClientsPage>>(queryKeys.clientList(search, view), (old) =>
      old && { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) },
    );
    await refetch();
  }, [qc, refetch, search, view]);

  /** For screen focus: tabs stay mounted, so React Query never refetches them on its own. */
  const reloadIfStale = useCallback(() => {
    const cached = qc.getQueryCache().find({ queryKey: queryKeys.clientList(search, view), exact: true });
    if (cached?.state.data && cached.state.fetchStatus === 'idle' && cached.isStale()) {
      reload().catch(() => {});
    }
  }, [qc, reload, search, view]);

  return { query, reload, reloadIfStale };
}
