import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { NotificationRecord } from '@/types';
import { queryKeys, STALE } from './keys';

export function useNotificationHistory(enabled = true) {
  return useQuery<NotificationRecord[]>({
    queryKey: queryKeys.notificationHistory,
    queryFn: async () => {
      const res = await api.get('/notifications/history?limit=50');
      return res.data.notifications ?? [];
    },
    staleTime: STALE.SHORT,
    enabled,
  });
}

export function useEmailQuota(enabled = true) {
  return useQuery<{ used: number; max: number }>({
    queryKey: queryKeys.emailQuota,
    queryFn: async () => {
      const res = await api.get('/notifications/email-quota');
      return { used: res.data.emailQuotaUsed, max: res.data.emailQuotaMax };
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

export function useSendPushNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      const res = await api.post('/notifications/send-to-all', payload);
      return res.data as { recipientCount: number; successCount: number; failureCount: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationHistory });
    },
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { subject: string; body: string }) => {
      const res = await api.post('/notifications/send-email-to-all', payload);
      return res.data as { recipientCount: number; successCount: number; failureCount: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.emailQuota });
      qc.invalidateQueries({ queryKey: queryKeys.notificationHistory });
    },
  });
}
