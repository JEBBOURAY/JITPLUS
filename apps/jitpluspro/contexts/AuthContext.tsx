import React, { createContext, useContext, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import api, { onUnauthorized } from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { logInfo, logWarn, logError } from '@/utils/devLogger';
import i18n from '@/i18n';
import { Merchant, LoginCredentials, AuthResponse, TeamMember } from '@/types';
import { useAuthStore } from '@/stores/authStore';

// ── Lazy-load expo-notifications ──
// Le require('expo-notifications') déclenche un side-effect (DevicePushTokenAutoRegistration)
// qui crash dans Expo Go SDK 53+. On ne charge JAMAIS le module dans Expo Go.
const isExpoGo = Constants.appOwnership === 'expo';

let _notifications: typeof import('expo-notifications') | null = null;
const getNotifications = () => {
  if (isExpoGo) return null; // Ne jamais charger dans Expo Go
  if (_notifications) return _notifications;
  try {
    _notifications = require('expo-notifications');
    return _notifications;
  } catch (e) {
    logWarn('Push', 'expo-notifications unavailable', e);
    return null;
  }
};

// ── Device info helpers ───────────────────────────────────────
const getDeviceInfo = () => {
  let deviceName = 'Appareil inconnu';
  try {
    deviceName = Constants.deviceName || (Platform.OS === 'ios' ? 'iPhone' : 'Android');
  } catch {
    deviceName = Platform.OS === 'ios' ? 'iPhone' : 'Android';
  }
  const deviceOS = Platform.OS === 'ios'
    ? `iOS ${Platform.Version}`
    : `Android ${Platform.Version}`;
  return { deviceName, deviceOS };
};

const getOrCreateDeviceId = async (): Promise<string> => {
  let deviceId = await SecureStore.getItemAsync('deviceId');
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await SecureStore.setItemAsync('deviceId', deviceId);
  }
  return deviceId;
};

/**
 * Demande la permission push et enregistre le token FCM/Expo sur le backend.
 * Protégé contre les limitations d'Expo Go (SDK 53+).
 * Si `promptIfNeeded` est false (défaut), ne demande PAS la permission à l'utilisateur
 * (seulement si déjà accordée). Cela évite un pop-up système dès le premier login.
 */
const registerPushToken = async (promptIfNeeded = false) => {
  try {
    if (!Device.isDevice) {
      logInfo('Push', 'Pas un appareil physique, skip');
      return;
    }

    const Notif = getNotifications();
    if (!Notif) {
      logInfo('Push', 'Notifications non disponibles, skip');
      return;
    }

    if (typeof Notif.getPermissionsAsync !== 'function') {
      logInfo('Push', 'Notifications non disponibles (Expo Go)');
      return;
    }

    const { status: existingStatus } = await Notif.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      if (!promptIfNeeded) {
        logInfo('Push', 'Permission non accordée — attente action utilisateur');
        return;
      }
      const { status } = await Notif.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logInfo('Push', 'Permission refusée');
      return;
    }

    // Récupérer le projectId — essayer EAS config, sinon fallback
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;

    if (!projectId) {
      logWarn('Push', 'Pas de projectId EAS configuré, skip push token');
      return;
    }

    // Préférer le token natif (FCM Android / APNs iOS) — Firebase Admin SDK en a besoin
    let pushToken: string;
    try {
      const nativeToken = await Notif.getDevicePushTokenAsync();
      pushToken = nativeToken.data as string;
      logInfo('Push', 'Native device token:', pushToken);
    } catch (e) {
      // Native token unavailable — cannot register for push (Firebase Admin SDK
      // only supports native FCM/APNs tokens, not Expo push tokens).
      logWarn('Push', 'Native token unavailable, skipping push registration:', e);
      return;
    }
    logInfo('Push', 'Token:', pushToken);

    // Read the stored app language to sync with backend
    const language = await AsyncStorage.getItem('jitpluspro_language') || 'fr';

    // Envoyer au backend
    await api.patch('/merchant/push-token', { pushToken, language });
    logInfo('Push', 'Token enregistré sur le backend');
  } catch (error) {
    logWarn('Push', 'Erreur enregistrement token:', error);
  }
};

// Android notification channels are now set up in utils/notifications.ts
// (imported and called from _layout.tsx's ThemedNavigator).

interface AuthContextData {
  merchant: Merchant | null;
  loading: boolean;
  token: string | null;
  isTeamMember: boolean;
  teamMember: TeamMember | null;
  onboardingCompleted: boolean;
  signIn: (credentials: LoginCredentials, rememberMe?: boolean) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  appleLogin: (identityToken: string, givenName?: string, familyName?: string) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  googleRegister: (idToken: string, businessData: GoogleRegisterData) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  appleRegister: (identityToken: string, givenName: string | undefined, familyName: string | undefined, businessData: AppleRegisterData) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<Merchant | null>;
  updateMerchant: (data: Partial<Merchant>) => void;
  completeOnboarding: () => Promise<void>;
}

/** Shared business/store fields collected during any registration flow (email, Google, Apple). */
export interface BusinessProfileData {
  nomCommerce?: string;
  categorie?: string;
  ville?: string;
  phoneNumber?: string;
  quartier?: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  termsAccepted?: boolean;
  referralCode?: string;
  description?: string;
  storePhone?: string;
  instagram?: string;
  tiktok?: string;
}

/** Business info needed for Google-based merchant registration */
export type GoogleRegisterData = BusinessProfileData;

/** Business info needed for Apple-based merchant registration */
export type AppleRegisterData = BusinessProfileData;

/** Data for standard email/password registration */
export interface RegisterData extends BusinessProfileData {
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextData | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const { merchant, token, loading, isTeamMember, teamMember, onboardingCompleted } = useAuthStore();

  const signOut = useCallback(async () => {
    try {
      // Clear push token from backend so this device stops receiving notifications
      api.patch('/merchant/push-token', { pushToken: '' }).catch(() => {});
      // Fire-and-forget — don't block local cleanup on server response
      api.post('/auth/logout').catch(() => {});
      await Promise.allSettled([
        SecureStore.deleteItemAsync('accessToken'),
        SecureStore.deleteItemAsync('refreshToken'),
        SecureStore.deleteItemAsync('sessionId'),
        SecureStore.deleteItemAsync('rememberMe'),
        SecureStore.deleteItemAsync('userType'),
        SecureStore.deleteItemAsync('teamMember'),
      ]);
      queryClientRef.current.clear();
      await AsyncStorage.removeItem('jitpluspro-query-cache').catch(() => {});
      useAuthStore.getState().reset();
      useAuthStore.getState().setLoading(false);
    } catch (error) {
      logError('Auth', 'Erreur lors de la déconnexion:', error);
    }
  }, []);

  const loadProfile = useCallback(async (): Promise<Merchant | null> => {
    try {
      logInfo('Auth', 'Chargement du profil...');
      const response = await api.get<Merchant>('/merchant/profile');
      logInfo('Auth', 'Profil chargé:', response.data.nom);
      useAuthStore.getState().setMerchant(response.data);
      return response.data;
    } catch (error: unknown) {
      logError('Auth', 'Erreur profil:', error);
      // Supprimé : signOut() aveugle. C'est le rôle de l'intercepteur API (401) de déconnecter proprement l'utilisateur.
      // Un simple fail réseau ne doit pas déconnecter l'utilisateur actif.
      throw error;
    }
  }, []);

  useEffect(() => {
    // Android notification channels are now set up in _layout.tsx via utils/notifications.ts

    const loadStoredAuth = async () => {
      const s = useAuthStore.getState();
      try {
        logInfo('Auth', 'Chargement de l\'authentification...');
        // Parallelize SecureStore reads to reduce boot time (~400ms → ~100ms)
        const results = await Promise.allSettled([
          SecureStore.getItemAsync('accessToken'),
          SecureStore.getItemAsync('rememberMe'),
          SecureStore.getItemAsync('userType'),
          SecureStore.getItemAsync('teamMember'),
        ]);
        const [storedToken, rememberMe, storedUserType, storedTeamMember] = results.map(
          (r) => (r.status === 'fulfilled' ? r.value : null)
        );

        if (__DEV__) {
          logInfo('Auth', 'Token:', storedToken ? 'Oui' : 'Non');
          logInfo('Auth', 'Remember:', rememberMe);
          logInfo('Auth', 'Type:', storedUserType);
        }

        if (storedToken && rememberMe === 'true') {
          s.setToken(storedToken);

          if (storedUserType === 'team_member' && storedTeamMember) {
            try {
              const tmData = JSON.parse(storedTeamMember);
              s.setTeamMember(true, tmData);
            } catch (e) {
              logError('Auth', 'Erreur parsing teamMember:', e);
              s.setTeamMember(false, null);
              await SecureStore.deleteItemAsync('teamMember').catch(() => {});
              await SecureStore.deleteItemAsync('userType').catch(() => {});
            }
          }

          const storedOnboarding = await SecureStore.getItemAsync('onboardingCompleted');
          if (storedOnboarding === 'true') {
            s.setOnboardingCompleted(true);
          }

          try {
            const profile = await loadProfile();
            if (profile?.onboardingCompleted) {
              useAuthStore.getState().setOnboardingCompleted(true);
              await SecureStore.setItemAsync('onboardingCompleted', 'true');
            }
            registerPushToken(true).catch((err) => {
              logWarn('Auth', 'Push token registration failed:', err);
              // Report to Sentry so we have visibility on push failures in production
              if (!__DEV__) {
                try {
                  const Sentry = require('@sentry/react-native');
                  Sentry.captureException(err, { tags: { source: 'push-registration' } });
                } catch {}
              }
            });
          } catch {
            logWarn('Auth', 'Session expirée, retour à l\'écran de connexion');
            return;
          }
        } else if (storedToken) {
          await Promise.allSettled([
            SecureStore.deleteItemAsync('accessToken'),
            SecureStore.deleteItemAsync('refreshToken'),
            SecureStore.deleteItemAsync('sessionId'),
            SecureStore.deleteItemAsync('rememberMe'),
            SecureStore.deleteItemAsync('userType'),
            SecureStore.deleteItemAsync('teamMember'),
          ]);
          s.reset();
        }
      } catch (error) {
        logWarn('Auth', 'Erreur lors du chargement de l\'authentification:', error);
        await signOut();
      } finally {
        logInfo('Auth', 'Chargement terminé');
        useAuthStore.getState().setLoading(false);
      }
    };

    loadStoredAuth();

    const unsubscribe = onUnauthorized(() => {
      logInfo('Auth', '401 détecté, déconnexion automatique');
      const s = useAuthStore.getState();
      s.setToken(null);
      s.setMerchant(null);
      s.setTeamMember(false, null);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Shared post-authentication success handler — saves tokens, sets state, registers push */
  const handleAuthSuccess = useCallback(async (
    response: AuthResponse,
    options: { rememberMe?: boolean; userType?: string; teamMemberData?: TeamMember | null } = {},
  ) => {
    const { access_token, refresh_token, session_id, merchant: merchantData } = response;
    const { rememberMe = true, userType, teamMemberData } = options;

    // Always store tokens in SecureStore so the API interceptor can attach them.
    // The rememberMe flag only controls whether the session persists across app restarts
    // (checked in loadStoredAuth on launch).
    await SecureStore.setItemAsync('accessToken', access_token);
    if (refresh_token) await SecureStore.setItemAsync('refreshToken', refresh_token);
    if (session_id) await SecureStore.setItemAsync('sessionId', session_id);
    await SecureStore.setItemAsync('rememberMe', String(rememberMe));

    const s = useAuthStore.getState();
    if (userType === 'team_member' && teamMemberData) {
      await SecureStore.setItemAsync('userType', 'team_member');
      await SecureStore.setItemAsync('teamMember', JSON.stringify(teamMemberData));
      s.setTeamMember(true, teamMemberData);
    } else {
      await SecureStore.setItemAsync('userType', 'merchant');
      await SecureStore.deleteItemAsync('teamMember');
      s.setTeamMember(false, null);
    }

    s.setToken(access_token);
    s.setMerchant(merchantData);

    if (merchantData.onboardingCompleted) {
      s.setOnboardingCompleted(true);
      await SecureStore.setItemAsync('onboardingCompleted', 'true');
    }

    registerPushToken(true).catch((err) => {
      logWarn('Auth', 'Push token registration failed:', err);
      if (!__DEV__) {
        try {
          const Sentry = require('@sentry/react-native');
          Sentry.captureException(err, { tags: { source: 'push-registration' } });
        } catch {}
      }
    });
  }, []);

  const signIn = useCallback(async (credentials: LoginCredentials, rememberMe = false) => {
    try {
      logInfo('Auth', 'Tentative de connexion...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/login', {
        ...credentials,
        deviceName,
        deviceOS,
        deviceId,
      });

      if (!response.data?.merchant) {
        throw new Error(i18n.t('auth.invalidServerResponse'));
      }

      logInfo('Auth', 'Connexion réussie:', response.data.merchant.nom, '| Type:', response.data.userType);

      await handleAuthSuccess(response.data, {
        rememberMe,
        userType: response.data.userType,
        teamMemberData: response.data.teamMember ?? null,
      });
    } catch (error: unknown) {
      logError('Auth', 'Erreur de connexion:', error);
      throw error;
    }
  }, [handleAuthSuccess]);

  const register = useCallback(async (data: RegisterData) => {
    try {
      logInfo('Auth', 'Inscription...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/register', {
        ...data,
        deviceName,
        deviceOS,
        deviceId,
      });

      if (!response.data?.merchant) {
        throw new Error(i18n.t('auth.invalidServerResponse'));
      }

      logInfo('Auth', 'Inscription réussie:', response.data.merchant.nom);

      await handleAuthSuccess(response.data, { rememberMe: true });
    } catch (error: unknown) {
      logError('Auth', 'Erreur inscription:', error);
      throw error;
    }
  }, [handleAuthSuccess]);

  const googleLogin = useCallback(async (idToken: string): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      logInfo('Auth', 'Google login...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/google-login', {
        idToken,
        deviceName,
        deviceOS,
        deviceId,
      });

      logInfo('Auth', 'Google login réussi:', response.data.merchant.nom);

      await handleAuthSuccess(response.data);
      return { success: true };
    } catch (error: unknown) {
      logError('Auth', 'Erreur Google login:', error);
      return { success: false, error: getErrorMessage(error, i18n.t('auth.googleLoginError')), rawError: error };
    }
  }, [handleAuthSuccess]);

  const appleLogin = useCallback(async (
    identityToken: string,
    givenName?: string,
    familyName?: string,
  ): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      logInfo('Auth', 'Apple login...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/apple-login', {
        identityToken,
        givenName,
        familyName,
        deviceName,
        deviceOS,
        deviceId,
      });

      logInfo('Auth', 'Apple login réussi:', response.data.merchant.nom);

      await handleAuthSuccess(response.data);
      return { success: true };
    } catch (error: unknown) {
      logError('Auth', 'Erreur Apple login:', error);
      return { success: false, error: getErrorMessage(error, i18n.t('auth.appleLoginError')), rawError: error };
    }
  }, [handleAuthSuccess]);

  const googleRegister = useCallback(async (idToken: string, businessData: GoogleRegisterData): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      logInfo('Auth', 'Google register...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/google-register', {
        idToken,
        ...businessData,
        deviceName,
        deviceOS,
        deviceId,
      });

      logInfo('Auth', 'Google register réussi:', response.data.merchant.nom);

      await handleAuthSuccess(response.data);
      return { success: true };
    } catch (error: unknown) {
      logError('Auth', 'Erreur Google register:', error);
      return { success: false, error: getErrorMessage(error, i18n.t('auth.googleRegisterError')), rawError: error };
    }
  }, [handleAuthSuccess]);

  const appleRegister = useCallback(async (
    identityToken: string,
    givenName: string | undefined,
    familyName: string | undefined,
    businessData: AppleRegisterData,
  ): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      logInfo('Auth', 'Apple register...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/apple-register', {
        identityToken,
        givenName,
        familyName,
        ...businessData,
        deviceName,
        deviceOS,
        deviceId,
      });

      logInfo('Auth', 'Apple register réussi:', response.data.merchant.nom);

      await handleAuthSuccess(response.data);
      return { success: true };
    } catch (error: unknown) {
      logError('Auth', 'Erreur Apple register:', error);
      return { success: false, error: getErrorMessage(error, i18n.t('auth.appleRegisterError')), rawError: error };
    }
  }, [handleAuthSuccess]);

  const completeOnboarding = useCallback(async () => {
    try {
      await api.patch('/merchant/complete-onboarding');
      await SecureStore.setItemAsync('onboardingCompleted', 'true');
      useAuthStore.getState().setOnboardingCompleted(true);
    } catch (error) {
      logWarn('Auth', 'completeOnboarding API error:', error);
      // Still update local state so user isn't stuck, backend will sync on next login
      await SecureStore.setItemAsync('onboardingCompleted', 'true');
      useAuthStore.getState().setOnboardingCompleted(true);
    }
  }, []);

  const updateMerchant = useCallback((data: Partial<Merchant>) => {
    useAuthStore.getState().updateMerchant(data);
  }, []);

  const contextValue = useMemo<AuthContextData>(() => ({
    merchant,
    token,
    loading,
    isTeamMember,
    teamMember,
    onboardingCompleted,
    signIn,
    register,
    googleLogin,
    appleLogin,
    googleRegister,
    appleRegister,
    signOut,
    loadProfile,
    updateMerchant,
    completeOnboarding,
  }), [merchant, token, loading, isTeamMember, teamMember, onboardingCompleted, signIn, register, googleLogin, appleLogin, googleRegister, appleRegister, signOut, loadProfile, updateMerchant, completeOnboarding]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Legacy hook — returns the full auth context (causes re-render on ANY auth change).
 * For new code, prefer selective Zustand subscriptions:
 *   import { useAuthStore } from '@/stores/authStore';
 *   const merchant = useAuthStore((s) => s.merchant);
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};
