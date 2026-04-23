import { AxiosInstance } from 'axios';
import { Client, OtpResponse } from '@/types';

export function createProfileMethods(http: AxiosInstance) {
  return {
    async getProfile(): Promise<Client> {
      const { data } = await http.get('/client-auth/profile');
      return data;
    },
    async updateProfile(updates: Partial<Pick<Client, 'prenom' | 'nom' | 'email' | 'telephone' | 'countryCode' | 'shareInfoMerchants' | 'notifPush' | 'notifEmail' | 'notifWhatsapp' | 'language' | 'dateNaissance'>> & { dateNaissance?: string | null }): Promise<Client> {
      const { data } = await http.patch('/client-auth/profile', updates);
      return data;
    },
    async sendChangeContactOtp(type: 'email' | 'telephone', value: string): Promise<OtpResponse> {
      const { data } = await http.post('/client-auth/send-change-contact-otp', { type, value });
      return data;
    },
    async verifyChangeContactOtp(type: 'email' | 'telephone', value: string, code: string): Promise<{ success: boolean; message: string }> {
      const { data } = await http.post('/client-auth/verify-change-contact-otp', { type, value, code });
      return data;
    },
    async deleteAccount(password: string): Promise<{ success: boolean }> {
      const { data } = await http.post('/client-auth/delete-account', { confirmation: 'SUPPRIMER', password });
      return data;
    },
    async exportPersonalData(): Promise<unknown> {
      const { data } = await http.get('/client-auth/data-export');
      return data;
    },
    async getTransactionsHistory(page: number = 1, limit: number = 50): Promise<any> {
      const { data } = await http.get('/client/transactions', { params: { page, limit } });
      return data;
    },
    async getRewardsHistory(page: number = 1, limit: number = 50): Promise<any> {
      const { data } = await http.get('/client/rewards', { params: { page, limit } });
      return data;
    },
  };
}
