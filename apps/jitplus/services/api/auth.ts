import { AxiosInstance } from 'axios';
import { AuthResponse, Client, CompleteProfileResponse, OtpResponse } from '@/types';
import { persistTokens } from './storage';

// Module-level dedup state for push-token PATCHes. See `updatePushToken` below.
let _lastPushToken: string | null = null;
let _lastPushTokenAt = 0;

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
    async appleLogin(identityToken: string, givenName?: string, familyName?: string, rawNonce?: string): Promise<AuthResponse> {
      const { data } = await http.post('/client-auth/apple-login', { identityToken, givenName, familyName, rawNonce });
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
      // Dedup: Android Notifications.addPushTokenListener can re-fire when
      // getExpoPushTokenAsync runs inside the callback, causing a runaway
      // loop that spams /push-token and triggers backend throttling (429).
      // Skip if same token was just sent (any time) or if a different one
      // was sent in the last 10s (collapse burst on app resume / re-renders).
      const now = Date.now();
      if (pushToken && pushToken === _lastPushToken) {
        return { success: true };
      }
      if (now - _lastPushTokenAt < 10_000) {
        return { success: true };
      }
      _lastPushToken = pushToken;
      _lastPushTokenAt = now;
      const { data } = await http.patch('/client-auth/push-token', { pushToken });
      return data;
    },
    /**
     * Consume a Quick-Add claim token (WhatsApp magic link). Merges the
     * anonymous client created by the merchant into the authenticated client
     * account (transactions, loyalty cards, lucky-wheel tickets).
     */
    async consumeClaim(token: string): Promise<{
      success: true;
      alreadyConsumed: boolean;
      mergedCards: number;
      merchant: { id: string; nom: string | null };
    }> {
      const { data } = await http.post('/client-auth/claim', { token });
      return data;
    },
  };
}
