import React, { createContext, useContext, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import api, { onUnauthorized } from '../services/api';
import { getErrorMessage } from '../utils/error';
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
    if (__DEV__) console.warn('expo-notifications unavailable', e);
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
      if (__DEV__) console.log('[Push] Pas un appareil physique, skip');
      return;
    }

    const Notif = getNotifications();
    if (!Notif) {
      if (__DEV__) console.log('[Push] Notifications non disponibles, skip');
      return;
    }

    if (typeof Notif.getPermissionsAsync !== 'function') {
      if (__DEV__) console.log('[Push] Notifications non disponibles (Expo Go)');
      return;
    }

    const { status: existingStatus } = await Notif.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      if (!promptIfNeeded) {
        if (__DEV__) console.log('[Push] Permission non accordée — attente action utilisateur');
        return;
      }
      const { status } = await Notif.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.log('[Push] Permission refusée');
      return;
    }

    // Récupérer le projectId — essayer EAS config, sinon fallback
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;

    if (!projectId) {
      if (__DEV__) console.warn('[Push] Pas de projectId EAS configuré, skip push token');
      return;
    }

    // Préférer le token natif (FCM Android / APNs iOS) — Firebase Admin SDK en a besoin
    let pushToken: string;
    try {
      const nativeToken = await Notif.getDevicePushTokenAsync();
      pushToken = nativeToken.data as string;
      if (__DEV__) console.log('[Push] Native device token:', pushToken);
    } catch (e) {
      // Native token unavailable — cannot register for push (Firebase Admin SDK
      // only supports native FCM/APNs tokens, not Expo push tokens).
      if (__DEV__) console.warn('[Push] Native token unavailable, skipping push registration:', e);
      return;
    }
    if (__DEV__) console.log('[Push] Token:', pushToken);

    // Envoyer au backend
    await api.patch('/merchant/push-token', { pushToken });
    if (__DEV__) console.log('[Push] Token enregistré sur le backend');
  } catch (error) {
    if (__DEV__) console.warn('[Push] Erreur enregistrement token:', error);
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
  googleLogin: (idToken: string) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  googleRegister: (idToken: string, businessData: GoogleRegisterData) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<Merchant | null>;
  updateMerchant: (data: Partial<Merchant>) => void;
  completeOnboarding: () => Promise<void>;
}

/** Business info needed for Google-based merchant registration */
export interface GoogleRegisterData {
  nom: string;
  categorie: string;
  ville: string;
  phoneNumber: string;
  quartier?: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  termsAccepted: boolean;
  referralCode?: string;
}

const AuthContext = createContext<AuthContextData | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const { merchant, token, loading, isTeamMember, teamMember, onboardingCompleted } = useAuthStore();

  const signOut = useCallback(async () => {
    try {
      // Fire-and-forget — don't block local cleanup on server response
      api.post('/auth/logout').catch(() => {});
      // Delete all tokens in parallel — if one fails the rest still clear
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
      if (__DEV__) console.error('Erreur lors de la déconnexion:', error);
    }
  }, []);

  const loadProfile = useCallback(async (): Promise<Merchant | null> => {
    try {
      if (__DEV__) console.log('[AuthContext] Chargement du profil...');
      const response = await api.get<Merchant>('/merchant/profile');
      if (__DEV__) console.log('[AuthContext] Profil chargé:', response.data.nom);
      useAuthStore.getState().setMerchant(response.data);
      return response.data;
    } catch (error: unknown) {
      if (__DEV__) console.error('[AuthContext] Erreur profil:', error);
      await signOut();
      throw error;
    }
  }, [signOut]);

  useEffect(() => {
    // Android notification channels are now set up in _layout.tsx via utils/notifications.ts

    const loadStoredAuth = async () => {
      const s = useAuthStore.getState();
      try {
        if (__DEV__) console.log('[AuthContext] Chargement de l\'authentification...');
        // Parallelize SecureStore reads to reduce boot time (~400ms → ~100ms)
        const [storedToken, rememberMe, storedUserType, storedTeamMember] = await Promise.all([
          SecureStore.getItemAsync('accessToken'),
          SecureStore.getItemAsync('rememberMe'),
          SecureStore.getItemAsync('userType'),
          SecureStore.getItemAsync('teamMember'),
        ]);

        if (__DEV__) {
          console.log('[AuthContext] Token:', storedToken ? 'Oui' : 'Non');
          console.log('[AuthContext] Remember:', rememberMe);
          console.log('[AuthContext] Type:', storedUserType);
        }

        if (storedToken && rememberMe === 'true') {
          s.setToken(storedToken);

          if (storedUserType === 'team_member' && storedTeamMember) {
            try {
              const tmData = JSON.parse(storedTeamMember);
              s.setTeamMember(true, tmData);
            } catch (e) {
              if (__DEV__) console.error('[AuthContext] Erreur parsing teamMember:', e);
              // Remove corrupted data to prevent persistent parse failures
              await SecureStore.deleteItemAsync('teamMember').catch(() => {});
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
            registerPushToken().catch((err) => {
              if (__DEV__) console.warn('[AuthContext] Push token registration failed:', err);
              // Report to Sentry so we have visibility on push failures in production
              if (!__DEV__) {
                const Sentry = require('@sentry/react-native');
                Sentry.captureException(err, { tags: { source: 'push-registration' } });
              }
            });
          } catch {
            if (__DEV__) console.warn('[AuthContext] Session expirée, retour à l\'écran de connexion');
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
        if (__DEV__) console.warn('[AuthContext] Erreur lors du chargement de l\'authentification:', error);
        await signOut();
      } finally {
        if (__DEV__) console.log('[AuthContext] Chargement terminé');
        useAuthStore.getState().setLoading(false);
      }
    };

    loadStoredAuth();

    const unsubscribe = onUnauthorized(() => {
      if (__DEV__) console.log('[AuthContext] 401 détecté, déconnexion automatique');
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

    if (rememberMe) {
      await SecureStore.setItemAsync('accessToken', access_token);
      if (refresh_token) await SecureStore.setItemAsync('refreshToken', refresh_token);
      if (session_id) await SecureStore.setItemAsync('sessionId', session_id);
    }
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

    registerPushToken().catch((err) => {
      if (__DEV__) console.warn('[AuthContext] Push token registration failed:', err);
      if (!__DEV__) {
        const Sentry = require('@sentry/react-native');
        Sentry.captureException(err, { tags: { source: 'push-registration' } });
      }
    });
  }, []);

  const signIn = useCallback(async (credentials: LoginCredentials, rememberMe = false) => {
    try {
      if (__DEV__) console.log('[AuthContext] Tentative de connexion...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/login', {
        ...credentials,
        deviceName,
        deviceOS,
        deviceId,
      });

      if (__DEV__) console.log('[AuthContext] Connexion réussie:', response.data.merchant.nom, '| Type:', response.data.userType);

      await handleAuthSuccess(response.data, {
        rememberMe,
        userType: response.data.userType,
        teamMemberData: response.data.teamMember,
      });
    } catch (error: unknown) {
      if (__DEV__) console.error('[AuthContext] Erreur de connexion:', error);
      throw new Error(getErrorMessage(error, 'Erreur de connexion'));
    }
  }, [handleAuthSuccess]);

  const googleLogin = useCallback(async (idToken: string): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      if (__DEV__) console.log('[AuthContext] Google login...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/google-login', {
        idToken,
        deviceName,
        deviceOS,
        deviceId,
      });

      if (__DEV__) console.log('[AuthContext] Google login réussi:', response.data.merchant.nom);

      await handleAuthSuccess(response.data);
      return { success: true };
    } catch (error: unknown) {
      if (__DEV__) console.error('[AuthContext] Erreur Google login:', error);
      return { success: false, error: getErrorMessage(error, 'Échec de la connexion Google'), rawError: error };
    }
  }, [handleAuthSuccess]);

  const googleRegister = useCallback(async (idToken: string, businessData: GoogleRegisterData): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      if (__DEV__) console.log('[AuthContext] Google register...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/google-register', {
        idToken,
        ...businessData,
        deviceName,
        deviceOS,
        deviceId,
      });

      if (__DEV__) console.log('[AuthContext] Google register réussi:', response.data.merchant.nom);

      await handleAuthSuccess(response.data);
      return { success: true };
    } catch (error: unknown) {
      if (__DEV__) console.error('[AuthContext] Erreur Google register:', error);
      return { success: false, error: getErrorMessage(error, "Échec de l'inscription Google"), rawError: error };
    }
  }, [handleAuthSuccess]);

  const completeOnboarding = useCallback(async () => {
    try {
      await api.patch('/merchant/complete-onboarding');
    } catch (error) {
      if (__DEV__) console.warn('[AuthContext] completeOnboarding API error:', error);
    }
    await SecureStore.setItemAsync('onboardingCompleted', 'true');
    useAuthStore.getState().setOnboardingCompleted(true);
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
    googleLogin,
    googleRegister,
    signOut,
    loadProfile,
    updateMerchant,
    completeOnboarding,
  }), [merchant, token, loading, isTeamMember, teamMember, onboardingCompleted, signIn, googleLogin, googleRegister, signOut, loadProfile, updateMerchant, completeOnboarding]);

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
