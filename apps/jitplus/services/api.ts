import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createApiClient, resolveApiUrl, resolveServerBaseUrl } from '@jitplus/shared/src/apiFactory';
import { AuthResponse, Client, ClientReferralStats, CompleteProfileResponse, Merchant, OtpResponse, PointsOverview, NotificationsResponse, QrTokenResponse } from '@/types';

const ENV_URL = process.env.EXPO_PUBLIC_API_URL;
const IS_DEV = __DEV__;

/** Base server URL (without /api/v1) — used for static assets like uploaded images */
export function getServerBaseUrl(): string {
  return resolveServerBaseUrl(ENV_URL, IS_DEV);
}

// ── SecureStore wrapper (falls back to memory on web) ──
const memoryTokens: Record<string, string | null> = {
  auth_token: null,
  refresh_token: null,
};
/** When false, tokens are kept in memory only (not persisted to SecureStore) */
let _shouldPersist = true;

async function getStored(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return memoryTokens[key] ?? null;
  try {
    return (await SecureStore.getItemAsync(key)) ?? null;
  } catch (e) {
    if (IS_DEV) console.warn(`SecureStore read failed (${key}):`, e);
    return null;
  }
}

async function setStored(key: string, value: string): Promise<void> {
  memoryTokens[key] = value;
  if (Platform.OS !== 'web' && _shouldPersist) {
    try { await SecureStore.setItemAsync(key, value); } catch (e) {
      if (IS_DEV) console.warn(`SecureStore write failed (${key}):`, e);
    }
  }
}

async function removeStored(key: string): Promise<void> {
  memoryTokens[key] = null;
  if (Platform.OS !== 'web') {
    try { await SecureStore.deleteItemAsync(key); } catch (e) {
      if (IS_DEV) console.warn(`SecureStore delete failed (${key}):`, e);
    }
  }
}

const getToken = () => getStored('auth_token');
const setToken = (token: string) => setStored('auth_token', token);
const removeToken = () => removeStored('auth_token');

const getRefreshToken = () => getStored('refresh_token');
const setRefreshToken = (token: string) => setStored('refresh_token', token);
const removeRefreshToken = () => removeStored('refresh_token');

const AUTH_ROUTES = [
  '/client-auth/send-otp',
  '/client-auth/verify-otp',
  '/client-auth/refresh',
  '/client-auth/login-email',
  '/client-auth/login-phone',
  '/client-auth/google-login',
];

class ApiService {
  private api;
  private onUnauthorized?: () => void;

  /** Register a callback invoked when a 401 is received (e.g. to redirect to login) */
  setOnUnauthorized(callback: () => void) {
    this.onUnauthorized = callback;
  }

  constructor() {
    this.api = createApiClient({
      envUrl: ENV_URL,
      isDev: IS_DEV,
      timeout: 15000,
      getToken,
      setToken,
      refreshToken: async () => {
        const rt = await getRefreshToken();
        if (!rt) throw new Error('No refresh token');

        const baseURL = resolveApiUrl(ENV_URL, IS_DEV);
        const { data } = await axios.post(`${baseURL}/client-auth/refresh`, {
          refresh_token: rt,
        });

        if (data.refresh_token) await setRefreshToken(data.refresh_token);
        if (!data.access_token) throw new Error('No access token in refresh response');
        return data.access_token;
      },
      onAuthFailure: () => {
        removeToken().catch(() => {});
        removeRefreshToken().catch(() => {});
        this.onUnauthorized?.();
      },
      authRoutes: AUTH_ROUTES,
    });
  }

  // ── Auth ────────────────────────────────────────────────
  async sendOtp(telephone: string, isRegister = false): Promise<OtpResponse> {
    const { data } = await this.api.post('/client-auth/send-otp', { telephone, isRegister });
    return data;
  }

  /** Store both tokens from an auth response */
  private async persistTokens(data: { access_token?: string; refresh_token?: string }) {
    if (data.access_token) await setToken(data.access_token);
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
  }

  async verifyOtp(telephone: string, code: string, isRegister = false): Promise<AuthResponse> {
    const { data } = await this.api.post('/client-auth/verify-otp', { telephone, code, isRegister });
    await this.persistTokens(data);
    return data;
  }

  // devLogin removed — endpoint only available via direct HTTP in dev builds

  // ── Email OTP ───────────────────────────────────────────
  async sendOtpEmail(email: string, isRegister = false, telephone?: string): Promise<OtpResponse> {
    const { data } = await this.api.post('/client-auth/send-otp-email', { email, isRegister, ...(telephone && { telephone }) });
    return data;
  }

  async verifyOtpEmail(email: string, code: string, isRegister = false): Promise<AuthResponse> {
    const { data } = await this.api.post('/client-auth/verify-otp-email', { email, code, isRegister });
    await this.persistTokens(data);
    return data;
  }

  // ── Google Login ────────────────────────────────────────
  async googleLogin(idToken: string): Promise<AuthResponse> {
    const { data } = await this.api.post('/client-auth/google-login', { idToken });
    await this.persistTokens(data);
    return data;
  }

  // ── Email + Password Login ──────────────────────────────
  async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
    const { data } = await this.api.post('/client-auth/login-email', { email, password });
    await this.persistTokens(data);
    return data;
  }

  // ── Phone + Password Login ──────────────────────────────
  async loginWithPhone(telephone: string, password: string): Promise<AuthResponse> {
    const { data } = await this.api.post('/client-auth/login-phone', { telephone, password });
    await this.persistTokens(data);
    return data;
  }

  async setPassword(password: string): Promise<{ success: boolean; client: Client }> {
    const { data } = await this.api.post('/client-auth/set-password', { password });
    return data;
  }

  async changePassword(currentPassword: string | undefined, newPassword: string): Promise<{ success: boolean; client: Client }> {
    const { data } = await this.api.patch('/client-auth/change-password', {
      ...(currentPassword ? { currentPassword } : {}),
      newPassword,
    });
    return data;
  }

  async completeProfile(prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string): Promise<CompleteProfileResponse> {
    const { data } = await this.api.post('/client-auth/complete-profile', {
      prenom,
      nom,
      termsAccepted,
      ...(telephone ? { telephone } : {}),
      ...(dateNaissance ? { dateNaissance } : {}),
      ...(password ? { password } : {}),
    });
    return data;
  }

  // ── Profile ─────────────────────────────────────────────
  async getProfile(): Promise<Client> {
    const { data } = await this.api.get('/client-auth/profile');
    return data;
  }

  async updateProfile(updates: Partial<Pick<Client, 'prenom' | 'nom' | 'email' | 'telephone' | 'countryCode' | 'shareInfoMerchants' | 'notifWhatsapp' | 'dateNaissance'>> & { dateNaissance?: string | null }): Promise<Client> {
    const { data } = await this.api.patch('/client-auth/profile', updates);
    return data;
  }

  async sendChangeContactOtp(type: 'email' | 'telephone', value: string): Promise<OtpResponse> {
    const { data } = await this.api.post('/client-auth/send-change-contact-otp', { type, value });
    return data;
  }

  async verifyChangeContactOtp(type: 'email' | 'telephone', value: string, code: string): Promise<{ success: boolean; message: string }> {
    const { data } = await this.api.post('/client-auth/verify-change-contact-otp', { type, value, code });
    return data;
  }

  async deleteAccount(password: string): Promise<{ success: boolean }> {
    const { data } = await this.api.post('/client-auth/delete-account', {
      confirmation: 'SUPPRIMER',
      password,
    });
    return data;
  }

  // ── Points & Cards ──────────────────────────────────────
  async getPointsOverview(): Promise<PointsOverview> {
    const { data } = await this.api.get('/client/points');
    return data;
  }

  // ── Discover ────────────────────────────────────────────
  async getMerchants(): Promise<Merchant[]> {
    // Use public endpoint when no auth token (guest mode), authenticated endpoint otherwise
    const token = await this.getStoredToken();
    const url = token ? '/client/merchants' : '/client-auth/merchants';
    const { data } = await this.api.get(url);
    // Backend returns { merchants: [...], pagination: {...} }
    if (Array.isArray(data)) return data;
    if (data?.merchants && Array.isArray(data.merchants)) return data.merchants;
    if (__DEV__) console.warn('[API] Unexpected getMerchants response shape:', data);
    return [];
  }

  async getMerchantById(id: string): Promise<Merchant> {
    const { data } = await this.api.get(`/client/merchants/${id}`);
    return data;
  }

  async joinMerchant(merchantId: string): Promise<{ success: boolean; card: { id: string; points: number; createdAt: string } }> {
    const { data } = await this.api.post(`/client/merchants/${merchantId}/join`);
    return data;
  }

  async leaveMerchant(merchantId: string): Promise<{ success: boolean }> {
    const { data } = await this.api.delete(`/client/merchants/${merchantId}/leave`);
    return data;
  }

  // ── Notifications ───────────────────────────────────────
  async getNotifications(page: number = 1, limit: number = 30): Promise<NotificationsResponse> {
    const { data } = await this.api.get('/client/notifications', { params: { page, limit } });
    return data;
  }

  async getUnreadCount(): Promise<{ unreadCount: number }> {
    const { data } = await this.api.get('/client/notifications/unread-count');
    return data;
  }

  async markNotificationAsRead(notificationId: string): Promise<{ success: boolean }> {
    const { data } = await this.api.patch(`/client/notifications/${notificationId}/read`);
    return data;
  }

  async markAllNotificationsAsRead(): Promise<{ success: boolean; count: number }> {
    const { data } = await this.api.patch('/client/notifications/read-all');
    return data;
  }

  async dismissNotification(notificationId: string): Promise<{ success: boolean }> {
    const { data } = await this.api.delete(`/client/notifications/${notificationId}`);
    return data;
  }

  async dismissAllNotifications(): Promise<{ success: boolean; count: number }> {
    const { data } = await this.api.delete('/client/notifications/all');
    return data;
  }

  // ── Referral ────────────────────────────────────────────
  async getReferralStats(): Promise<ClientReferralStats> {
    const { data } = await this.api.get('/client/referral');
    return data;
  }

  // ── Data Export ─────────────────────────────────────────
  async exportPersonalData(): Promise<unknown> {
    const { data } = await this.api.get('/client-auth/data-export');
    return data;
  }

  // ── QR Token ─────────────────────────────────────────
  /** Get a permanent signed QR token (HMAC-based, never expires) */
  async getQrToken(): Promise<QrTokenResponse> {
    const { data } = await this.api.post('/client-auth/qr-token');
    return data;
  }

  // ── Token management ────────────────────────────────────
  async getStoredToken(): Promise<string | null> {
    return getToken();
  }

  async clearAuth(): Promise<void> {
    await removeToken();
    await removeRefreshToken();
    await this.clearEmailOtpNewUser();
    await this.clearRememberMe();
    // Clear cached permanent QR token from SecureStore
    if (Platform.OS !== 'web') {
      try { await SecureStore.deleteItemAsync('qr_permanent_token'); } catch (e) {
        if (IS_DEV) console.warn('SecureStore delete failed (qr_permanent_token):', e);
      }
    }
  }

  // ── Remember Me preference ──────────────────────────────
  /** Set whether tokens should be persisted across app restarts */
  async setRememberMe(value: boolean): Promise<void> {
    _shouldPersist = value;
    if (Platform.OS !== 'web') {
      try { await SecureStore.setItemAsync('rememberMe', String(value)); } catch {}
    }
  }

  /** Read the stored rememberMe preference (defaults to false on error) */
  async getRememberMe(): Promise<boolean> {
    if (Platform.OS === 'web') return true;
    try {
      const val = await SecureStore.getItemAsync('rememberMe');
      return val === 'true';
    } catch { return false; }
  }

  async clearRememberMe(): Promise<void> {
    _shouldPersist = true;
    if (Platform.OS !== 'web') {
      try { await SecureStore.deleteItemAsync('rememberMe'); } catch {}
    }
  }

  // ── Email-OTP new-user flag (persists across app restarts) ───
  /** Mark that an email-OTP registration is in progress and needs a password setup */
  async setEmailOtpNewUser(): Promise<void> {
    if (Platform.OS === 'web') return;
    try { await SecureStore.setItemAsync('email_otp_new_user', '1'); } catch (e) {
      if (__DEV__) console.warn('SecureStore write failed (email_otp_new_user):', e);
    }
  }

  /** Returns true if an email-OTP new registration needs password setup */
  async getEmailOtpNewUser(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try { return (await SecureStore.getItemAsync('email_otp_new_user')) === '1'; } catch { return false; }
  }

  /** Clear the flag once password has been set (or on logout) */
  async clearEmailOtpNewUser(): Promise<void> {
    if (Platform.OS === 'web') return;
    try { await SecureStore.deleteItemAsync('email_otp_new_user'); } catch {}
  }

  async logout(): Promise<void> {
    await this.api.post('/client-auth/logout');
  }

  // ── Push Token ──────────────────────────────────────────
  async updatePushToken(pushToken: string): Promise<{ success: boolean }> {
    const { data } = await this.api.patch('/client-auth/push-token', { pushToken });
    return data;
  }
}

export const api = new ApiService();
