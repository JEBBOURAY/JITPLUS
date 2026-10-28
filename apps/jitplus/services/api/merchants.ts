import { AxiosInstance } from 'axios';
import { Merchant, StampsOverview, QrTokenResponse } from '@/types';
import { getToken } from './storage';

export function createMerchantMethods(http: AxiosInstance) {
  return {
    async getStampsOverview(): Promise<StampsOverview> {
      const { data } = await http.get('/client/stamps');
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
      const token = await getToken();
      const base = token ? '/client/merchants' : '/client-auth/merchants';
      const { data } = await http.get(`${base}/${encodeURIComponent(id)}`);
      return data;
    },
    async joinMerchant(merchantId: string): Promise<{ success: boolean; card: { id: string; stamps: number; createdAt: string } }> {
      const { data } = await http.post(`/client/merchants/${encodeURIComponent(merchantId)}/join`);
      return data;
    },
    async leaveMerchant(merchantId: string): Promise<{ success: boolean }> {
      const { data } = await http.delete(`/client/merchants/${encodeURIComponent(merchantId)}/leave`);
      return data;
    },
    async reportMerchant(
      merchantId: string,
      reason: 'inappropriate' | 'spam' | 'fraud' | 'closed' | 'wrong_info' | 'other',
      details?: string,
    ): Promise<{ success: boolean; message: string }> {
      const { data } = await http.post(`/client/merchants/${encodeURIComponent(merchantId)}/report`, { reason, details });
      return data;
    },
    async blockMerchant(merchantId: string): Promise<{ success: boolean }> {
      const { data } = await http.post(`/client/merchants/${encodeURIComponent(merchantId)}/block`);
      return data;
    },
    async unblockMerchant(merchantId: string): Promise<{ success: boolean }> {
      const { data } = await http.delete(`/client/merchants/${encodeURIComponent(merchantId)}/block`);
      return data;
    },
    async getBlockedMerchants(): Promise<Array<{ merchantId: string; blockedAt: string; id: string; nom: string; logoUrl: string | null; categorie: string }>> {
      const { data } = await http.get('/client/blocked-merchants');
      return Array.isArray(data) ? data : [];
    },
    async getQrToken(): Promise<QrTokenResponse> {
      const { data } = await http.post('/client-auth/qr-token');
      return data;
    },
  };
}
