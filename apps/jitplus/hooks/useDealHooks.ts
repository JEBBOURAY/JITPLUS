/**
 * React Query hooks for « Bons plans » (client app). Deal lists depend on the
 * position and expire quickly, so they are never persisted to disk
 * (see utils/queryPersister).
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  buildDealAlertUpdate, roundCoord, type DealAlertUpdate, type DealArea, type DealFeedQuery,
} from '@/services/api/deals';
import { isEntityId } from '@/utils/ids';
import { useAuthStore } from '@/stores/authStore';
import type { Coords } from '@/hooks/useKnownLocation';
import {
  findMoroccoCity, type ClientDealDetail, type ClientDealSummary, type DealAlertPreferences, type DealCategoryCountsResponse,
  type DealCitiesResponse,
  type DealEventType, type DealFeedResponse, type DealFeedSort, type DealFeedTab, type DealReportReason,
} from '@jitplus/shared/src/deals';

export { dealArea, type DealAlertUpdate, type DealArea } from '@/services/api/deals';

const FEED_STALE_MS = 2 * 60 * 1000;
const LIST_GC_MS = 5 * 60 * 1000;

/**
 * Signed out (a deal opened from a shared link) = public routes. The cache key
 * carries it: a visitor's copy (no blocked merchants or reports) never serves a member.
 */
const useIsGuestViewer = () => useAuthStore((s) => !s.client);

const dealKeys = {
  feeds: ['deals', 'feed'] as const,
  feed: (q: Omit<DealFeedQuery, 'cursor'>) =>
    ['deals', 'feed', q.tab, q.cityKey ?? null, q.category ?? null, q.lat ?? null, q.lng ?? null, q.q ?? null, q.sort ?? null] as const,
  categoryCounts: (q: Pick<DealFeedQuery, 'tab' | 'cityKey' | 'lat' | 'lng'>) =>
    ['deals', 'feed', 'categories', q.tab, q.cityKey ?? null, q.lat ?? null, q.lng ?? null] as const,
  detail: (id: string, guest = false) => ['deals', 'detail', id, guest] as const,
  merchantLists: ['deals', 'merchant'] as const,
  merchant: (merchantId: string) => ['deals', 'merchant', merchantId] as const,
  cities: (lat: number | null, lng: number | null) => ['deals', 'cities', lat, lng] as const,
  alerts: ['deals', 'alerts'] as const,
} as const;

/** Feeds and merchant deal lists, e.g. after blocking a merchant the server now leaves out. */
export function invalidateDealLists(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: dealKeys.feeds });
  qc.invalidateQueries({ queryKey: dealKeys.merchantLists });
}

/** What narrows or orders a feed on top of its tab and area. */
interface DealFeedFilters {
  category: string | null;
  q: string | null;
  sort: DealFeedSort;
}

export function useDealsFeed(tab: DealFeedTab, area: DealArea, filters: DealFeedFilters, enabled = true) {
  const query: Omit<DealFeedQuery, 'cursor'> = { tab, ...filters, ...area };
  return useInfiniteQuery<DealFeedResponse, Error, InfiniteData<DealFeedResponse>, ReturnType<typeof dealKeys.feed>, string | undefined>({
    queryKey: dealKeys.feed(query),
    queryFn: ({ pageParam }) => api.getDealFeed({ ...query, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: FEED_STALE_MS,
    gcTime: LIST_GC_MS,
    enabled,
  });
}

/**
 * Under dealKeys.feeds, so reporting a deal refreshes the counts with the lists.
 * The previous counts stay on screen while another tab or area loads.
 */
export function useDealCategoryCounts(tab: DealFeedTab, area: DealArea, enabled = true) {
  const query = { tab, ...area };
  return useQuery<DealCategoryCountsResponse>({
    queryKey: dealKeys.categoryCounts(query),
    queryFn: () => api.getDealCategoryCounts(query),
    placeholderData: keepPreviousData,
    staleTime: FEED_STALE_MS,
    gcTime: LIST_GC_MS,
    enabled,
  });
}

/**
 * Each fetch counts a view for the merchant: a long staleTime and no refetch
 * on mount/focus keep re-opening the same deal from inflating it.
 */
export function useDeal(id: string | undefined, enabled = true) {
  const guest = useIsGuestViewer();
  return useQuery<ClientDealDetail>({
    queryKey: dealKeys.detail(id ?? '', guest),
    queryFn: () => api.getDeal(id!, {}, guest),
    enabled: enabled && isEntityId(id),
    staleTime: 10 * 60 * 1000,
    gcTime: LIST_GC_MS,
    refetchOnMount: false,
  });
}

export function useMerchantDeals(merchantId: string | undefined, enabled = true) {
  return useQuery<ClientDealSummary[]>({
    queryKey: dealKeys.merchant(merchantId ?? ''),
    queryFn: () => api.getMerchantDeals(merchantId!),
    enabled: enabled && isEntityId(merchantId),
    staleTime: FEED_STALE_MS,
    gcTime: LIST_GC_MS,
  });
}

export function useDealCities(coords: Coords | null, enabled = true) {
  const lat = coords ? roundCoord(coords.latitude) : null;
  const lng = coords ? roundCoord(coords.longitude) : null;
  return useQuery<DealCitiesResponse>({
    queryKey: dealKeys.cities(lat, lng),
    queryFn: () => api.getDealCities({ lat, lng }),
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: LIST_GC_MS,
  });
}


/** Stats only: a lost event must never bother the user. */
export function recordDealEvent(id: string, type: DealEventType): void {
  api.recordDealEvent(id, type, !useAuthStore.getState().client).catch((e) => { if (__DEV__) console.warn('Deal event failed', e); });
}

/** The pass is kept in the deal's cache, so reopening the screen shows "Montrer en caisse". */
export function useClaimDeal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.claimDeal(dealId),
    onSuccess: ({ claimedAt }) => {
      qc.setQueryData<ClientDealDetail>(dealKeys.detail(dealId), (deal) => deal && { ...deal, claimedAt });
    },
  });
}

/** Optimistic bookmark; the "Enregistrés" lists are refetched once the server agrees. */
export function useSaveDeal(dealId: string) {
  const qc = useQueryClient();
  const key = dealKeys.detail(dealId);
  const setSaved = (saved: boolean) => qc.setQueryData<ClientDealDetail>(key, (deal) => deal && { ...deal, saved });
  return useMutation({
    mutationFn: (saved: boolean) => api.setDealSaved(dealId, saved),
    // Snapshot, not `!saved`: with two quick taps the second rollback would flip the wrong way.
    onMutate: async (saved) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ClientDealDetail>(key)?.saved;
      setSaved(saved);
      return { previous };
    },
    onError: (_error, _saved, context) => {
      if (context?.previous !== undefined) setSaved(context.previous);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.feeds, predicate: (q) => q.queryKey[2] === 'saved' });
    },
  });
}

export function useReportDeal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reason, comment }: { reason: DealReportReason; comment?: string }) =>
      api.reportDeal(dealId, reason, comment),
    onSuccess: () => {
      // The server hides a reported deal from the reporter's lists.
      qc.invalidateQueries({ queryKey: dealKeys.feeds });
      qc.invalidateQueries({ queryKey: dealKeys.merchantLists });
    },
  });
}

const ALERTS_MUTATION_KEY = ['deals', 'alerts', 'update'] as const;

export function useDealAlerts(enabled = true) {
  return useQuery<DealAlertPreferences>({
    queryKey: dealKeys.alerts,
    queryFn: () => api.getDealAlerts(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Applies the change to the cache right away. The server answer only replaces
 * it when no other change is still in flight, so quick successive taps never
 * flash back to an older state.
 */
export function useUpdateDealAlerts() {
  const qc = useQueryClient();
  return useMutation<DealAlertPreferences, Error, DealAlertUpdate, { previous?: DealAlertPreferences }>({
    mutationKey: ALERTS_MUTATION_KEY,
    mutationFn: (update) => api.updateDealAlerts(update),
    onMutate: async (update) => {
      await qc.cancelQueries({ queryKey: dealKeys.alerts });
      const previous = qc.getQueryData<DealAlertPreferences>(dealKeys.alerts);
      if (previous) qc.setQueryData<DealAlertPreferences>(dealKeys.alerts, { ...previous, ...buildDealAlertUpdate(update) });
      return { previous };
    },
    onError: (_error, _update, context) => {
      if (context?.previous) qc.setQueryData(dealKeys.alerts, context.previous);
      qc.invalidateQueries({ queryKey: dealKeys.alerts });
    },
    onSuccess: (prefs) => {
      // This mutation still counts as pending while its onSuccess runs.
      if (qc.isMutating({ mutationKey: ALERTS_MUTATION_KEY }) <= 1) qc.setQueryData(dealKeys.alerts, prefs);
    },
  });
}

const CITY_PREF_KEY = '@jitplus_deals_city';

/** City picked in the feed header; null = around me (GPS, else the whole country). */
export function useDealCityPreference(): [string | null, (cityKey: string | null) => void, boolean] {
  const [cityKey, setCityKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CITY_PREF_KEY)
      .then((v) => { if (alive && findMoroccoCity(v)) setCityKey(v); })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const choose = useCallback((next: string | null) => {
    setCityKey(next);
    (next ? AsyncStorage.setItem(CITY_PREF_KEY, next) : AsyncStorage.removeItem(CITY_PREF_KEY)).catch(() => {});
  }, []);

  return [cityKey, choose, ready];
}
