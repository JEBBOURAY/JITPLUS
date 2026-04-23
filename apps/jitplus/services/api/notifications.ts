import { AxiosInstance } from 'axios';
import { NotificationsResponse } from '@/types';

export function createNotificationMethods(http: AxiosInstance) {
  return {
    async getNotifications(page: number = 1, limit: number = 30): Promise<NotificationsResponse> {
      const { data } = await http.get('/client/notifications', { params: { page, limit } });
      return data;
    },
    async getUnreadCount(): Promise<{ unreadCount: number }> {
      const { data } = await http.get('/client/notifications/unread-count');
      return data;
    },
    async markNotificationAsRead(notificationId: string): Promise<{ success: boolean }> {
      const { data } = await http.patch(`/client/notifications/${notificationId}/read`);
      return data;
    },
    async markAllNotificationsAsRead(): Promise<{ success: boolean; count: number }> {
      const { data } = await http.patch('/client/notifications/read-all');
      return data;
    },
    async dismissNotification(notificationId: string): Promise<{ success: boolean }> {
      const { data } = await http.delete(`/client/notifications/${notificationId}`);
      return data;
    },
    async dismissAllNotifications(): Promise<{ success: boolean; count: number }> {
      const { data } = await http.delete('/client/notifications/all');
      return data;
    },
  };
}
