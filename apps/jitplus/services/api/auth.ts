import { AxiosInstance } from 'axios';
import { AuthResponse, Client, CompleteProfileResponse, OtpResponse } from '@/types';
import { persistTokens } from './storage';

export function createAuthMethods(http: AxiosInstance) {
  return {
    async sendOtpEmail(email: string, isRegister = false): Promise<OtpResponse> {
      const { data } = await http.post('/client-auth/send-otp-email', { email, isRegister });
      return data;
    },
    async verifyOtpEmail(email: string, code: string, isRegister = false): Promise<AuthResponse> {
      const { data } = await http.post('/client-auth/verify-otp-email', { email, code, isRegister });
      await persistTokens(data);
      return data;
    },
    async googleLogin(idToken: string): Promise<AuthResponse> {
      const { data } = await http.post('/client-auth/google-login', { idToken });
      await persistTokens(data);
      return data;
    },
    async appleLogin(identityToken: string, givenName?: string, familyName?: string): Promise<AuthResponse> {
      const { data } = await http.post('/client-auth/apple-login', { identityToken, givenName, familyName });
      await persistTokens(data);
      return data;
    },
    async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
      const { data } = await http.post('/client-auth/login-email', { email, password });
      await persistTokens(data);
      return data;
    },
    async setPassword(password: string): Promise<{ success: boolean; client: Client }> {
      const { data } = await http.post('/client-auth/set-password', { password });
      return data;
    },
    async resetPasswordOtp(password: string): Promise<{ success: boolean; client: Client }> {
      const { data } = await http.post('/client-auth/reset-password-otp', { password });
      return data;
    },
    async changePassword(currentPassword: string | undefined, newPassword: string): Promise<{ success: boolean; client: Client }> {
      const { data } = await http.patch('/client-auth/change-password', {
        ...(currentPassword ? { currentPassword } : {}),
        newPassword,
      });
      return data;
    },
    async completeProfile(prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string): Promise<CompleteProfileResponse> {
      const { data } = await http.post('/client-auth/complete-profile', {
        prenom, nom, termsAccepted,
        ...(telephone ? { telephone } : {}),
        ...(dateNaissance ? { dateNaissance } : {}),
        ...(password ? { password } : {}),
      });
      return data;
    },
    async logout(): Promise<void> {
      await http.post('/client-auth/logout');
    },
    async updatePushToken(pushToken: string): Promise<{ success: boolean }> {
      const { data } = await http.patch('/client-auth/push-token', { pushToken });
      return data;
    },
  };
}
