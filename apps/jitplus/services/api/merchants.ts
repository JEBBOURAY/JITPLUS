import { AxiosInstance } from 'axios';
import { Merchant, PointsOverview, QrTokenResponse } from '@/types';
import { getToken } from './storage';

export function createMerchantMethods(http: AxiosInstance) {
  return {
    async getProfileStats(): Promise<{ totalScans: number; totalRewards: number }> {
      const { data } = await http.get('/client/stats');
      return data;
    },
    async getPointsOverview(): Promise<PointsOverview> {
      const { data } = await http.get('/client/points');
      return data;
    },
    async getMerchants(page = 1, limit = 100): Promise<Merchant[]> {
      const token = await getToken();
      const url = token ? '/client/merchants' : '/client-auth/merchants';
      const { data } = await http.get(url, { params: { page, limit } });
      if (Array.isArray(data)) return data;
      if (data?.merchants && Array.isArray(data.merchants)) return data.merchants;
      if (__DEV__) console.warn('[API] Unexpected getMerchants response shape:', data);
      return [];
    },
    async getMerchantById(id: string): Promise<Merchant> {
      const { data } = await http.get(`/client/merchants/${id}`);
      return data;
    },
    async joinMerchant(merchantId: string): Promise<{ success: boolean; card: { id: string; points: number; createdAt: string } }> {
      const { data } = await http.post(`/client/merchants/${merchantId}/join`);
      return data;
    },
    async leaveMerchant(merchantId: string): Promise<{ success: boolean }> {
      const { data } = await http.delete(`/client/merchants/${merchantId}/leave`);
      return data;
    },
    async getQrToken(): Promise<QrTokenResponse> {
      const { data } = await http.post('/client-auth/qr-token');
      return data;
    },
  };
}
