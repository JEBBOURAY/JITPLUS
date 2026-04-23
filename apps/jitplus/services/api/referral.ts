import { AxiosInstance } from 'axios';
import { ClientReferralStats, PayoutRequest } from '@/types';

export function createReferralMethods(http: AxiosInstance) {
  return {
    async getReferralStats(): Promise<ClientReferralStats> {
      const { data } = await http.get('/client/referral');
      return data;
    },
    async requestPayout(amount: number, method: 'BANK_TRANSFER' | 'CASH', accountDetails?: string): Promise<PayoutRequest> {
      const { data } = await http.post('/client/referral/payout', { amount, method, accountDetails });
      return data;
    },
    async getPayoutHistory(): Promise<PayoutRequest[]> {
      const { data } = await http.get('/client/referral/payout');
      return data;
    },
  };
}
