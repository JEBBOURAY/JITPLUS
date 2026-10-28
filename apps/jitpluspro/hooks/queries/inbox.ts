import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { queryKeys, STALE } from './keys';

/** Merchant inbox: automatic notifications and admin broadcasts. */
export type InboxCategory =
  | 'SECURITY'
  | 'PLAN'
  | 'ACTIVITY'
  | 'TIP'
  | 'SETUP'
  | 'QUOTA'
  | 'OFFER'
  | 'ADMIN';

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  channel: string | null;
  createdAt: string;
  isRead: boolean;
  /** Missing on servers older than the inbox release; treat as ADMIN. */
  category?: InboxCategory;
  action?: string | null;
}

interface AdminNotificationsPage {
  notifications: AdminNotification[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

const INBOX_PAGE_SIZE = 20;

export function useAdminNotifications(enabled = true) {
  return useInfiniteQuery<AdminNotificationsPage>({
    queryKey: [...queryKeys.adminNotifications, 'feed'],
    queryFn: async ({ pageParam }) => {
      const res = await api.get('/merchant/admin-notifications', {
        params: { page: pageParam, limit: INBOX_PAGE_SIZE },
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

export function useAdminNotifUnreadCount(enabled = true) {
  return useQuery<{ count: number }>({
    queryKey: queryKeys.adminNotifUnreadCount,
    queryFn: async () => {
      const res = await api.get('/merchant/admin-notifications/unread-count');
      return res.data;
    },
    staleTime: STALE.FAST,
    enabled,
  });
}

type InboxCache = { pages: AdminNotificationsPage[]; pageParams: unknown[] };

function patchInboxCache(
  qc: ReturnType<typeof useQueryClient>,
  update: (n: AdminNotification) => AdminNotification,
) {
  qc.setQueriesData<InboxCache>({ queryKey: queryKeys.adminNotifications }, (old) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        notifications: page.notifications.map(update),
      })),
    };
  });
}

export function useMarkAdminNotifsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch('/merchant/admin-notifications/mark-read');
    },
    onSuccess: () => {
      patchInboxCache(qc, (n) => (n.isRead ? n : { ...n, isRead: true }));
      qc.setQueryData(queryKeys.adminNotifUnreadCount, { count: 0 });
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifUnreadCount });
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifications });
    },
  });
}

export function useMarkSingleAdminNotifRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/merchant/admin-notifications/${notificationId}/read`);
    },
    // Optimistic: the item turns "read" immediately, even when the tap navigates away.
    onMutate: (notificationId) => {
      patchInboxCache(qc, (n) => (n.id === notificationId ? { ...n, isRead: true } : n));
      qc.setQueryData<{ count: number }>(queryKeys.adminNotifUnreadCount, (old) =>
        old ? { count: Math.max(0, old.count - 1) } : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifications });
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifUnreadCount });
    },
  });
}
