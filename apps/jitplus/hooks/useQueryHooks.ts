/**
 * React Query hooks for data fetching with automatic caching,
 * stale-while-revalidate, deduplication, and retry.
 */
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/services/api';
import { PointsOverview, Merchant, NotificationsResponse } from '@/types';

// ── Query keys (centralised for easy invalidation) ──

export const queryKeys = {
  points: ['points'] as const,
  merchants: ['merchants'] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['notifications-unread-count'] as const,
} as const;

// ── Points / loyalty cards ──

export function usePointsOverview(enabled = true) {
  return useQuery<PointsOverview>({
    queryKey: queryKeys.points,
    queryFn: () => api.getPointsOverview(),
    staleTime: 30 * 1000, // 30s — WS auto-invalidates on transactions
    enabled,
  });
}

// ── Merchants (discover) ──

export function useMerchants(enabled = true) {
  return useQuery<Merchant[]>({
    queryKey: queryKeys.merchants,
    queryFn: () => api.getMerchants(),
    staleTime: 5 * 60 * 1000, // 5 min — merchant list changes rarely
    enabled,
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
    // Keeps the previous page data visible while the next page is loading
    // — prevents the list from flashing empty between page transitions.
    placeholderData: keepPreviousData,
    enabled,
  });
}

// ── Unread notification count ──
// NOTE: This hook is used in both CustomTabBar and NotificationsScreen.
// React Query deduplicates by queryKey — only one network request / polling
// timer is active regardless of how many components subscribe.

export function useUnreadNotificationCount(enabled = true) {
  return useQuery<{ unreadCount: number }>({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api.getUnreadCount(),
    staleTime: 10 * 1000, // 10s — WS/FCM handle real-time, low staleTime for quick foreground refresh
    refetchInterval: 30 * 1000, // poll every 30s — tighter fallback when WS is down
    enabled,
  });
}

// ── Notification mutations ──

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.markNotificationAsRead(notificationId),
    onMutate: async () => {
      // Optimistic update: decrement unread count immediately
      await queryClient.cancelQueries({ queryKey: queryKeys.unreadCount });
      const prev = queryClient.getQueryData<{ unreadCount: number }>(queryKeys.unreadCount);
      if (prev && prev.unreadCount > 0) {
        queryClient.setQueryData(queryKeys.unreadCount, { unreadCount: prev.unreadCount - 1 });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(queryKeys.unreadCount, context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsAsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.unreadCount });
      const prev = queryClient.getQueryData<{ unreadCount: number }>(queryKeys.unreadCount);
      queryClient.setQueryData(queryKeys.unreadCount, { unreadCount: 0 });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(queryKeys.unreadCount, context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.dismissNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}

export function useDismissAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.dismissAllNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}

// ── Merchant detail ──

export function useMerchantById(id: string | undefined, enabled = true) {
  return useQuery<Merchant>({
    queryKey: ['merchant', id] as const,
    queryFn: () => api.getMerchantById(id!),
    staleTime: 5 * 60 * 1000,
    enabled: enabled && !!id,
  });
}


