import React, { createContext, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { Client } from '@/types';
import { extractErrorMessage, isNetworkError as checkNetworkError } from '@/utils/errorMessage';
import { logInfo, logWarn, logError } from '@/utils/devLogger';
import { isNativePushRuntimeAvailable, registerForPushNotifications, setupAndroidChannel } from '@/utils/notifications';
import { useAuthStore } from '@/stores/authStore';

const LOGOUT_MAX_RETRIES = 2;
const LOGOUT_RETRY_DELAY_MS = 1000;

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
  sendOtpEmail: (email: string, isRegister?: boolean, telephone?: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  verifyOtpEmail: (email: string, code: string, isRegister?: boolean) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;
  loginWithEmail: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  loginWithPhone: (telephone: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  resetPasswordOtp: (password: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string; rawError?: unknown }>;
  appleLogin: (identityToken: string, givenName?: string, familyName?: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string; rawError?: unknown }>;

  completeProfile: (prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useAuthStore();
  const queryClient = useQueryClient();

  // Bumped on every login/logout so stale loadStoredAuth responses are discarded.
  const sessionVersionRef = useRef(0);

  // Check stored auth on mount + wire 401 handler
  useEffect(() => {
    // When the API receives a 401, auto-logout the user
    api.setOnUnauthorized(() => {
      store.setClient(null);
    });

    let cancelled = false;
    const version = sessionVersionRef.current;

    const loadStoredAuth = async () => {
      try {
        logInfo('Auth', 'Chargement de l\'authentification...');
        // Parallel local-storage reads (no network — safe to parallelize)
        const [storedNeedsPw, rememberMe, token] = await Promise.all([
          api.getEmailOtpNewUser(),
          api.getRememberMe(),
          api.getStoredToken(),
        ]);
        if (cancelled || sessionVersionRef.current !== version) return;
        if (storedNeedsPw) store.setNeedsPasswordSetup(true);

        if (token && rememberMe) {
          logInfo('Auth', 'Token trouvé, restauration session...');
          // Token exists and user wanted to be remembered
          const profile = await api.getProfile();
          if (cancelled || sessionVersionRef.current !== version) return;
          if (profile?.id) {
            store.setClient(profile);
            logInfo('Auth', 'Profil restauré:', profile.prenom, profile.nom);
          } else {
            // Profile response is invalid — clear tokens
            await api.clearAuth();
          }
        } else if (token) {
          // Token exists but user didn't want to be remembered → clear silently
          await api.clearAuth();
        }
      } catch (error: unknown) {
        if (cancelled || sessionVersionRef.current !== version) return;
        // Token invalid or expired — clear stored credentials and show login
        await api.clearAuth();
        const isExpired401 =
          error && typeof error === 'object' && 'response' in error &&
          (error as { response?: { status?: number } }).response?.status === 401;
        if (isExpired401) {
          logInfo('Auth', 'Session expirée, retour à l\'écran de connexion');
        } else {
          logWarn('Auth', 'Erreur restauration session:', error);
        }
      } finally {
        if (!cancelled && sessionVersionRef.current === version) {
          logInfo('Auth', 'Chargement terminé');
          store.setLoading(false);
        }
      }
    };

    loadStoredAuth();
    return () => { cancelled = true; };
  }, []);

  // Register push notifications when client is authenticated.
  // On Android: proactively request permission right after login — the system
  // dialog is non-intrusive and users expect it on Android.
  // On iOS: defer to the notification tab banner so we provide context first
  // (Apple guidelines require explaining the value before showing the prompt).
  useEffect(() => {
    if (!store.client?.id) return;

    const registerPush = async (retries = 2) => {
      try {
        await setupAndroidChannel();

        if (Platform.OS === 'android') {
          const pushToken = await registerForPushNotifications();
          if (pushToken) {
            const result = await api.updatePushToken(pushToken);
            logInfo('Push', 'Token envoyé au backend (Android):', pushToken.substring(0, 12), result);
          } else if (isNativePushRuntimeAvailable()) {
            logWarn('Push', 'Aucun token obtenu sur Android — notifications ne fonctionneront pas');
          }
        } else {
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
              logInfo('Push', 'Token envoyé au backend (iOS)');
            }
          } else {
            logInfo('Push', 'Permission iOS pas encore accordée — report à l\'onglet notifications');
          }
        }
      } catch (error) {
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 2000));
          return registerPush(retries - 1);
        }
        logWarn('Push', 'Échec enregistrement token:', error);
        // Report to Sentry so we have visibility on push failures in production
        if (!__DEV__) {
          const Sentry = require('@sentry/react-native');
          Sentry.captureException(error, { tags: { source: 'push-registration' } });
        }
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
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const verifyOtp = useCallback(async (telephone: string, code: string, isRegister = false) => {
    try {
      const response = await api.verifyOtp(telephone, code, isRegister);
      store.setClient(response.client);
      logInfo('Auth', 'OTP vérifié:', response.client?.prenom, '| nouveau:', response.isNewUser);
      // Flag phone-OTP new registrations so set-password is shown even after app restart
      if (response.isNewUser && isRegister) {
        await api.setEmailOtpNewUser();
        store.setNeedsPasswordSetup(true);
      }
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);



  const sendOtpEmail = useCallback(async (email: string, isRegister = false, telephone?: string) => {
    try {
      await api.sendOtpEmail(email, isRegister, telephone);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const verifyOtpEmail = useCallback(async (email: string, code: string, isRegister = false) => {
    try {
      const response = await api.verifyOtpEmail(email, code, isRegister);
      store.setClient(response.client);
      logInfo('Auth', 'OTP email vérifié:', response.client?.prenom, '| nouveau:', response.isNewUser);
      // Flag email-OTP new registrations so set-password is shown even after app restart
      if (response.isNewUser && isRegister) {
        await api.setEmailOtpNewUser();
        store.setNeedsPasswordSetup(true);
      }
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const googleLogin = useCallback(async (idToken: string) => {
    // Cancel any in-flight loadStoredAuth (same pattern as loginWithEmail / loginWithPhone)
    sessionVersionRef.current++;
    try {
      // Google users always stay signed in across restarts — mirror the rememberMe flag
      await api.setRememberMe(true);
      const response = await api.googleLogin(idToken);
      store.setClient(response.client);
      logInfo('Auth', 'Google login réussi:', response.client?.prenom, '| nouveau:', response.isNewUser);
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), rawError: error };
    }
  }, []);

  const appleLogin = useCallback(async (identityToken: string, givenName?: string, familyName?: string) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.appleLogin(identityToken, givenName, familyName);
      store.setClient(response.client);
      logInfo('Auth', 'Apple login réussi:', response.client?.prenom, '| nouveau:', response.isNewUser);
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), rawError: error };
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string, rememberMe = true) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(rememberMe);
      const response = await api.loginWithEmail(email, password);
      store.setClient(response.client);
      logInfo('Auth', 'Connexion email réussie:', response.client?.prenom);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const loginWithPhone = useCallback(async (telephone: string, password: string, rememberMe = true) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(rememberMe);
      const response = await api.loginWithPhone(telephone, password);
      store.setClient(response.client);
      logInfo('Auth', 'Connexion téléphone réussie:', response.client?.prenom);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const setPasswordFn = useCallback(async (password: string) => {
    try {
      const response = await api.setPassword(password);
      store.setClient(response.client);
      // Password is now set — clear the flag
      await api.clearEmailOtpNewUser();
      store.setNeedsPasswordSetup(false);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const resetPasswordOtpFn = useCallback(async (password: string) => {
    try {
      const response = await api.resetPasswordOtp(password);
      store.setClient(response.client);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const completeProfile = useCallback(async (prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string) => {
    try {
      const response = await api.completeProfile(prenom, nom, termsAccepted, telephone, dateNaissance, password);
      store.setClient(response.client);
      // If password was set during profile completion, clear the setup flag
      if (password) {
        await api.clearEmailOtpNewUser();
        store.setNeedsPasswordSetup(false);
      }
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    // Revoke refresh token server-side — retry once on network failure
    let logoutSucceeded = false;
    for (let attempt = 0; attempt < LOGOUT_MAX_RETRIES && !logoutSucceeded; attempt++) {
      try {
        await api.logout();
        logoutSucceeded = true;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, LOGOUT_RETRY_DELAY_MS));
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
      import('expo-secure-store').then((ss) => ss.deleteItemAsync('qr_permanent_token')).catch(() => {}),
      import('expo-secure-store').then((ss) => ss.deleteItemAsync('profile_draft')).catch(() => {}),
    ]);
    store.reset();
    logInfo('Auth', 'Déconnexion terminée');
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
      logError('Auth', 'Erreur rafraîchissement profil:', error);
    }
  }, []);

  const enterGuestMode = useCallback(() => {
    store.setGuest(true);
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    client: store.client,
    isLoading: store.loading,
    isAuthenticated: !!store.client,
    isProfileComplete: !!store.client?.nom && !!store.client?.prenom && (store.client?.termsAccepted !== false),
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
    resetPasswordOtp: resetPasswordOtpFn,
    googleLogin,
    appleLogin,
    completeProfile,
    logout,
    refreshProfile,
  }), [store.client, store.loading, store.needsPasswordSetup, store.isGuest, enterGuestMode, sendOtp, verifyOtp, sendOtpEmail, verifyOtpEmail, loginWithEmail, loginWithPhone, setPasswordFn, resetPasswordOtpFn, googleLogin, appleLogin, completeProfile, logout, refreshProfile]);

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
