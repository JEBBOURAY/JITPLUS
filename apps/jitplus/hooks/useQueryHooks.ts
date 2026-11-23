/**
 * React Query hooks for data fetching with automatic caching,
 * stale-while-revalidate, deduplication, and retry.
 */
import {
  useQuery, useInfiniteQuery, useMutation, useQueryClient,
  type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  StampsOverview, Merchant, NotificationsResponse, ClientNotification, LuckyWheelTicket, LuckyWheelDraw,
} from '@/types';
import { useWsStore } from '@/stores/wsStore';
import { useAuthStore } from '@/stores/authStore';

// ── Query keys (centralised for easy invalidation) ──

export const queryKeys = {
  stamps: ['stamps'] as const,
  merchants: ['merchants'] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['notifications-unread-count'] as const,
  luckyWheelDraws: ['lucky-wheel-available-draws'] as const,
  luckyWheelHistory: ['lucky-wheel-history'] as const,
  merchant: (id: string | undefined) => ['merchant', id] as const,
} as const;

/** A stamp can grant a lucky-wheel ticket: the wallet and the tickets move together. */
export function invalidateStamps(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.stamps });
  qc.invalidateQueries({ queryKey: queryKeys.luckyWheelDraws });
}

// Single-pass invalidation predicate for both notification-related caches —
// avoids triggering two separate refetch cycles.
const isNotificationsQuery = (q: { queryKey: readonly unknown[] }) => {
  const k = q.queryKey[0];
  return k === queryKeys.notifications[0] || k === queryKeys.unreadCount[0];
};

/** The notification feed and the unread badge, refetched together in one cycle. */
export function invalidateNotifications(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: isNotificationsQuery });
}

// ── Stamps / loyalty cards ──

export function useStampsOverview(
  enabled = true,
  refetchInterval: number | false | (() => number | false) = false,
) {
  return useQuery<StampsOverview>({
    queryKey: queryKeys.stamps,
    queryFn: () => api.getStampsOverview(),
    staleTime: 30 * 1000, // 30s — WS auto-invalidates on transactions
    enabled,
    refetchInterval,
  });
}

// ── Merchants (discover) ──

/** Keyed by client: the list differs per account (deal titles, blocked merchants). */
export function useMerchants(clientId: string | undefined) {
  return useQuery<Merchant[]>({
    queryKey: [...queryKeys.merchants, clientId],
    queryFn: () => api.getMerchants(),
    // 5 min, like the server cache: the list itself changes rarely, but it
    // carries the deal badges, which go stale much faster.
    staleTime: 5 * 60 * 1000,
    enabled: !!clientId,
  });
}

// ── Notifications (infinite scroll) ──

export function useNotifications(enabled = true) {
  return useInfiniteQuery<NotificationsResponse>({
    queryKey: queryKeys.notifications,
    queryFn: ({ pageParam }) => api.getNotifications(pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage?.pagination?.page != null && lastPage?.pagination?.totalPages != null
        && lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: 15 * 1000, // 15s — WS/FCM invalidates on new notifications, low staleTime ensures fast background refetch
    // Limit cache lifetime to prevent unbounded memory growth from infinite scroll
    gcTime: 5 * 60 * 1000, // 5 min — discard old pages sooner to limit memory
    enabled,
  });
}

// ── Unread notification count ──
// NOTE: This hook is used in both CustomTabBar and NotificationsScreen.
// React Query deduplicates by queryKey — only one network request / polling
// timer is active regardless of how many components subscribe.

export function useUnreadNotificationCount(enabled = true) {
  const wsConnected = useWsStore((s) => s.connected);
  return useQuery<{ unreadCount: number }>({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api.getUnreadCount(),
    staleTime: 10 * 1000, // 10s — WS/FCM handle real-time, low staleTime for quick foreground refresh
    // Poll only when WebSocket is disconnected; WS handles real-time updates otherwise
    refetchInterval: wsConnected ? false : 2 * 60 * 1000,
    // Stop polling when the app is backgrounded to save battery & network
    refetchIntervalInBackground: false,
    enabled,
  });
}

// ── Notification mutations ──
// All four mutations patch the cached list optimistically so the UI reacts
// instantly (no flicker between the action and the refetch), then roll back
// on error and re-sync with the server once settled.

type NotifPages = InfiniteData<NotificationsResponse>;
type UnreadCount = { unreadCount: number };
type NotifSnapshot = { prevList?: NotifPages; prevCount?: UnreadCount };

async function snapshotNotifications(queryClient: QueryClient): Promise<NotifSnapshot> {
  await queryClient.cancelQueries({ predicate: isNotificationsQuery });
  return {
    prevList: queryClient.getQueryData<NotifPages>(queryKeys.notifications),
    prevCount: queryClient.getQueryData<UnreadCount>(queryKeys.unreadCount),
  };
}

function patchNotificationList(
  queryClient: QueryClient,
  fn: (list: ClientNotification[]) => ClientNotification[],
) {
  queryClient.setQueryData<NotifPages>(queryKeys.notifications, (old) => old && ({
    ...old,
    pages: old.pages.map((p) => (p ? { ...p, notifications: fn(p.notifications ?? []) } : p)),
  }));
}

function setUnreadCount(queryClient: QueryClient, fn: (n: number) => number) {
  queryClient.setQueryData<UnreadCount>(queryKeys.unreadCount, (old) =>
    old ? { unreadCount: Math.max(0, fn(old.unreadCount)) } : old,
  );
}

function restoreNotifications(queryClient: QueryClient, ctx?: NotifSnapshot) {
  if (ctx?.prevList) queryClient.setQueryData(queryKeys.notifications, ctx.prevList);
  if (ctx?.prevCount) queryClient.setQueryData(queryKeys.unreadCount, ctx.prevCount);
}

function isUnreadInCache(queryClient: QueryClient, id: string): boolean {
  const data = queryClient.getQueryData<NotifPages>(queryKeys.notifications);
  return !!data?.pages.some((p) => p?.notifications?.some((n) => n.id === id && !n.isRead));
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.markNotificationAsRead(notificationId),
    onMutate: async (notificationId) => {
      const ctx = await snapshotNotifications(queryClient);
      const wasUnread = isUnreadInCache(queryClient, notificationId);
      patchNotificationList(queryClient, (list) => list.map((n) =>
        n.id === notificationId && !n.isRead ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
      ));
      if (wasUnread || !ctx.prevList) setUnreadCount(queryClient, (n) => n - 1);
      return ctx;
    },
    onError: (_err, _vars, ctx) => restoreNotifications(queryClient, ctx),
    onSettled: () => {
      // Single predicate invalidates both notification queries in one cycle.
      invalidateNotifications(queryClient);
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsAsRead(),
    onMutate: async () => {
      const ctx = await snapshotNotifications(queryClient);
      const readAt = new Date().toISOString();
      patchNotificationList(queryClient, (list) => list.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt })));
      setUnreadCount(queryClient, () => 0);
      return ctx;
    },
    onError: (_err, _vars, ctx) => restoreNotifications(queryClient, ctx),
    onSettled: () => {
      invalidateNotifications(queryClient);
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.dismissNotification(notificationId),
    onMutate: async (notificationId) => {
      const ctx = await snapshotNotifications(queryClient);
      const wasUnread = isUnreadInCache(queryClient, notificationId);
      patchNotificationList(queryClient, (list) => list.filter((n) => n.id !== notificationId));
      if (wasUnread) setUnreadCount(queryClient, (n) => n - 1);
      return ctx;
    },
    onError: (_err, _vars, ctx) => restoreNotifications(queryClient, ctx),
    onSettled: () => {
      invalidateNotifications(queryClient);
    },
  });
}

export function useDismissAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.dismissAllNotifications(),
    onMutate: async () => {
      const ctx = await snapshotNotifications(queryClient);
      patchNotificationList(queryClient, () => []);
      setUnreadCount(queryClient, () => 0);
      return ctx;
    },
    onError: (_err, _vars, ctx) => restoreNotifications(queryClient, ctx),
    onSettled: () => {
      invalidateNotifications(queryClient);
    },
  });
}

// ── Merchant detail ──

/**
 * Signed out (a shared link), the public payload has no card fields: it is
 * cached apart, so the member payload is fetched right after login.
 */
export function useMerchantById(id: string | undefined, enabled = true) {
  const signedOut = useAuthStore((s) => !s.client);
  return useQuery<Merchant>({
    queryKey: [...queryKeys.merchant(id), signedOut],
    queryFn: () => api.getMerchantById(id!),
    staleTime: 30_000,
    enabled: enabled && !!id,
  });
}

// ── LuckyWheel ──

export function useLuckyWheelAvailableDraws(enabled = true) {
  return useQuery<LuckyWheelTicket[]>({
    queryKey: queryKeys.luckyWheelDraws,
    queryFn: () => api.getLuckyWheelAvailableDraws(),
    staleTime: 30_000,
    enabled,
  });
}

export function useLuckyWheelHistory(enabled = true) {
  return useQuery<LuckyWheelDraw[]>({
    queryKey: queryKeys.luckyWheelHistory,
    queryFn: () => api.getLuckyWheelHistory(),
    staleTime: 30_000,
    enabled,
  });
}

export function useTriggerLuckyWheelDraw() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => api.triggerLuckyWheelDraw(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.luckyWheelDraws });
      queryClient.invalidateQueries({ queryKey: queryKeys.luckyWheelHistory });
    },
  });
}


