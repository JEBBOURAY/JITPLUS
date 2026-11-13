import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { BroadcastStatus, NotificationRecord } from '@/types';
import { queryKeys, STALE } from './keys';

type SendResult = { recipientCount: number; successCount: number; failureCount: number };

export function useNotificationHistory() {
  return useQuery<NotificationRecord[]>({
    queryKey: queryKeys.notificationHistory,
    queryFn: async () => {
      const res = await api.get('/notifications/history?limit=50');
      return res.data.notifications ?? [];
    },
    staleTime: STALE.SHORT,
  });
}

/** Whether the merchant has already sent a notification: a one-row probe, for the "Démarrage" guide. */
export function useHasSentNotification(enabled = true) {
  return useQuery<boolean>({
    queryKey: queryKeys.notificationSent,
    queryFn: async () => {
      const res = await api.get('/notifications/history?limit=1');
      return (res.data.notifications ?? []).length > 0;
    },
    staleTime: STALE.SHORT,
    enabled,
  });
}

/** Who a broadcast reaches and what is left of the daily quota, shown before sending. */
export function useBroadcastStatus(enabled = true) {
  return useQuery<BroadcastStatus>({
    queryKey: queryKeys.broadcastStatus,
    queryFn: async () => (await api.get('/notifications/broadcast-status')).data,
    staleTime: STALE.SHORT,
    enabled,
  });
}

/** Dry run of the server content filter: rejects with a 400 when the text is refused. */
export function useCheckNotificationContent() {
  return useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      await api.post('/notifications/check-content', payload);
    },
  });
}

export function useSendPushNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      const res = await api.post('/notifications/send-to-all', payload);
      return res.data as SendResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationHistory });
      qc.invalidateQueries({ queryKey: queryKeys.broadcastStatus });
    },
  });
}
