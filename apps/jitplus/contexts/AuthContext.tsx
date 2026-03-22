import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { Client } from '@/types';
import { extractErrorMessage } from '@/utils/errorMessage';
import { registerForPushNotifications, setupAndroidChannel } from '@/utils/notifications';
import { useAuthStore } from '@/stores/authStore';

interface AuthContextType {
  client: Client | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  /** True when the user is browsing without an account */
  isGuest: boolean;
  /** True when an email-OTP new registration is waiting for a password to be set */
  needsPasswordSetup: boolean;
  enterGuestMode: () => void;
  sendOtp: (telephone: string, isRegister?: boolean) => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (telephone: string, code: string, isRegister?: boolean) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;
  sendOtpEmail: (email: string, isRegister?: boolean) => Promise<{ success: boolean; error?: string }>;
  verifyOtpEmail: (email: string, code: string, isRegister?: boolean) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;
  loginWithEmail: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  loginWithPhone: (telephone: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;

  completeProfile: (prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useAuthStore();
  const queryClient = useQueryClient();

  // Check stored auth on mount + wire 401 handler
  useEffect(() => {
    // When the API receives a 401, auto-logout the user
    api.setOnUnauthorized(() => {
      store.setClient(null);
    });

    const loadStoredAuth = async () => {
      try {
        // Restore needsPasswordSetup flag (survives app restarts)
        const storedNeedsPw = await api.getEmailOtpNewUser();
        if (storedNeedsPw) store.setNeedsPasswordSetup(true);

        const rememberMe = await api.getRememberMe();
        const token = await api.getStoredToken();

        if (token && rememberMe) {
          // Token exists and user wanted to be remembered
          const profile = await api.getProfile();
          store.setClient(profile);
        } else if (token) {
          // Token exists but user didn't want to be remembered → clear silently
          await api.clearAuth();
        }
      } catch (error: unknown) {
        // Token invalid or expired â€” clear stored credentials and show login
        await api.clearAuth();
        if (__DEV__) {
          const isExpired401 =
            error && typeof error === 'object' && 'response' in error &&
            (error as { response?: { status?: number } }).response?.status === 401;
          if (isExpired401) {
            console.log('[Auth] Session expired, returning to login');
          } else {
            console.warn('Failed to restore session:', error);
          }
        }
      } finally {
        store.setLoading(false);
      }
    };

    loadStoredAuth();
  }, []);

  // Register push notifications when client is authenticated.
  // On Android: proactively request permission right after login — the system
  // dialog is non-intrusive and users expect it on Android.
  // On iOS: defer to the notification tab banner so we provide context first
  // (Apple guidelines require explaining the value before showing the prompt).
  useEffect(() => {
    if (!store.client?.id) return;

    const registerPush = async () => {
      try {
        await setupAndroidChannel();

        if (Platform.OS === 'android') {
          // On Android, always call registerForPushNotifications — it internally
          // calls requestPermissionsAsync() which shows the system dialog on
          // Android 13+ if not yet granted, and is a no-op if already granted.
          const pushToken = await registerForPushNotifications();
          if (pushToken) {
            await api.updatePushToken(pushToken);
            if (__DEV__) console.log('Push token sent to backend (Android)');
          }
        } else {
          // iOS: only register if already granted to avoid the cold prompt.
          // The notification tab banner will explain the value and let the
          // user opt-in at a meaningful moment.
          const alreadyGranted = await (async () => {
            try {
              const { getPermissionStatus } = require('@/utils/notifications') as typeof import('@/utils/notifications');
              return await getPermissionStatus();
            } catch { return false; }
          })();

          if (alreadyGranted) {
            const pushToken = await registerForPushNotifications();
            if (pushToken) {
              await api.updatePushToken(pushToken);
              if (__DEV__) console.log('Push token sent to backend (iOS)');
            }
          } else {
            if (__DEV__) console.log('iOS push permission not yet granted — deferring to notification tab');
          }
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to register push token:', error);
      }
    };

    registerPush();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.client?.id]);

  const sendOtp = useCallback(async (telephone: string, isRegister = false) => {
    try {
      await api.sendOtp(telephone, isRegister);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const verifyOtp = useCallback(async (telephone: string, code: string, isRegister = false) => {
    try {
      const response = await api.verifyOtp(telephone, code, isRegister);
      store.setClient(response.client);
      // Flag phone-OTP new registrations so set-password is shown even after app restart
      if (response.isNewUser && isRegister) {
        await api.setEmailOtpNewUser();
        store.setNeedsPasswordSetup(true);
      }
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);



  const sendOtpEmail = useCallback(async (email: string, isRegister = false) => {
    try {
      await api.sendOtpEmail(email, isRegister);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const verifyOtpEmail = useCallback(async (email: string, code: string, isRegister = false) => {
    try {
      const response = await api.verifyOtpEmail(email, code, isRegister);
      store.setClient(response.client);
      // Flag email-OTP new registrations so set-password is shown even after app restart
      if (response.isNewUser && isRegister) {
        await api.setEmailOtpNewUser();
        store.setNeedsPasswordSetup(true);
      }
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const googleLogin = useCallback(async (idToken: string) => {
    try {
      const response = await api.googleLogin(idToken);
      store.setClient(response.client);
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string, rememberMe = true) => {
    try {
      await api.setRememberMe(rememberMe);
      const response = await api.loginWithEmail(email, password);
      store.setClient(response.client);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const loginWithPhone = useCallback(async (telephone: string, password: string, rememberMe = true) => {
    try {
      await api.setRememberMe(rememberMe);
      const response = await api.loginWithPhone(telephone, password);
      store.setClient(response.client);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const setPasswordFn = useCallback(async (password: string) => {
    try {
      const response = await api.setPassword(password);
      store.setClient(response.client);
      // Password is now set â€” clear the flag
      await api.clearEmailOtpNewUser();
      store.setNeedsPasswordSetup(false);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const completeProfile = useCallback(async (prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string) => {
    try {
      const response = await api.completeProfile(prenom, nom, termsAccepted, telephone, dateNaissance);
      store.setClient(response.client);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    // Revoke refresh token server-side — retry once on network failure
    let logoutSucceeded = false;
    for (let attempt = 0; attempt < 2 && !logoutSucceeded; attempt++) {
      try {
        await api.logout();
        logoutSucceeded = true;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    // Clear auth tokens (SecureStore)
    await api.clearAuth();
    // Purge all cached sensitive data
    queryClient.clear();
    // Wipe ALL persisted data so the next user gets a clean slate.
    // Each removal is individually caught so one failure doesn't block others.
    await Promise.allSettled([
      AsyncStorage.removeItem('jitplus-query-cache'),
      AsyncStorage.removeItem('showWelcome'),
      AsyncStorage.removeItem('showGuidBadge'),
      // Clear QR token + profile draft from SecureStore
      import('expo-secure-store').then((ss) => ss.deleteItemAsync('qr_permanent_token')),
      import('expo-secure-store').then((ss) => ss.deleteItemAsync('profile_draft')),
    ]);
    store.reset();
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    try {
      const token = await api.getStoredToken();
      if (!token) return;
      const profile = await api.getProfile();
      store.setClient(profile);
    } catch (error: unknown) {
      if (error instanceof Error && 'response' in error) {
        const axiosErr = error as import('axios').AxiosError;
        if (axiosErr.response?.status === 401) {
          await api.clearAuth();
          store.setClient(null);
        }
      }
      if (__DEV__) console.error('Failed to refresh profile:', error);
    }
  }, []);

  const enterGuestMode = useCallback(() => {
    store.setGuest(true);
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    client: store.client,
    isLoading: store.loading,
    isAuthenticated: !!store.client,
    isProfileComplete: !!store.client?.nom && !!store.client?.prenom && !!store.client?.telephone && (store.client?.termsAccepted !== false),
    isGuest: store.isGuest,
    needsPasswordSetup: store.needsPasswordSetup,
    enterGuestMode,
    sendOtp,
    verifyOtp,
    sendOtpEmail,
    verifyOtpEmail,
    loginWithEmail,
    loginWithPhone,
    setPassword: setPasswordFn,
    googleLogin,
    completeProfile,
    logout,
    refreshProfile,
  }), [store.client, store.loading, store.needsPasswordSetup, store.isGuest, enterGuestMode, sendOtp, verifyOtp, sendOtpEmail, verifyOtpEmail, loginWithEmail, loginWithPhone, setPasswordFn, googleLogin, completeProfile, logout, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
