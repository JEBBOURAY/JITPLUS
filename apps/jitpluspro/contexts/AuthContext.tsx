import React, { createContext, useContext, useEffect, useCallback, useMemo, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { loadNotifications } from '@/utils/expoNotifications';
import * as Device from 'expo-device';
import { randomUUID } from '@/utils/crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import api, { onUnauthorized, resetApiTokenCache } from '@/services/api';
import { sendMerchantPushToken, resetMerchantPushTokenCache } from '@/services/merchantPushToken';
import { getErrorMessage } from '@/utils/error';
import { logInfo, logWarn, logError } from '@/utils/devLogger';
import { captureException } from '@/utils/sentry';
import i18n from '@/i18n';
import { Merchant, LoginCredentials, AuthResponse, TeamMember } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const isNetworkFailure = (e: unknown): boolean => {
  const err = e as { isAxiosError?: boolean; response?: unknown } | null;
  return !!err?.isAxiosError && !err.response;
};

// At boot the backend can be briefly unreachable (dev server restarting, radio
// waking up); retry network failures instead of dropping the user to login.
const PROFILE_BOOT_ATTEMPTS = 3;
const loadProfileWithRetry = async (load: () => Promise<Merchant | null>): Promise<Merchant | null> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (e) {
      if (!isNetworkFailure(e) || attempt >= PROFILE_BOOT_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
};

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

/** SecureStore keys of a persisted session. */
const SESSION_KEYS = ['accessToken', 'refreshToken', 'sessionId', 'rememberMe', 'userType', 'teamMember'];

const clearStoredSession = (extraKeys: string[] = []) =>
  Promise.allSettled([...SESSION_KEYS, ...extraKeys].map((key) => SecureStore.deleteItemAsync(key)));

const getOrCreateDeviceId = async (): Promise<string> => {
  let deviceId = await SecureStore.getItemAsync('deviceId');
  if (!deviceId) {
    deviceId = randomUUID();
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

    const Notif = loadNotifications();
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
      const { status } = await Notif.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowProvisional: true, // Permission provisoire sur iOS
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logInfo('Push', 'Permission refusée');
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;

    if (!projectId) {
      logWarn('Push', 'Pas de projectId EAS configuré, skip push token');
      return;
    }

    let pushToken: string;
    try {
      const expoToken = await Notif.getExpoPushTokenAsync({ projectId });
      pushToken = String(expoToken.data);
      logInfo('Push', 'Expo device token:', pushToken);
    } catch (e) {
      logWarn('Push', 'Expo token unavailable, skipping push registration:', e);
      return;
    }

    const language = await AsyncStorage.getItem('jitpluspro_language') || 'fr';

    // Deduped, see services/merchantPushToken.ts
    await sendMerchantPushToken(api, pushToken, language);
    logInfo('Push', 'Token enregistré sur le backend');
  } catch (error) {
    logWarn('Push', 'Erreur enregistrement token:', error);
  }
};

/** Fire-and-forget push registration: failures are reported, never thrown. */
const registerPushTokenInBackground = () => {
  registerPushToken(true).catch((err) => {
    logWarn('Auth', 'Push token registration failed:', err);
    if (!__DEV__) captureException(err, { tags: { source: 'push-registration' } });
  });
};

interface AuthContextData {
  merchant: Merchant | null;
  loading: boolean;
  isTeamMember: boolean;
  teamMember: TeamMember | null;
  signIn: (credentials: LoginCredentials, rememberMe?: boolean) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  appleLogin: (identityToken: string, givenName?: string, familyName?: string, rawNonce?: string) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  googleRegister: (idToken: string, businessData: GoogleRegisterData) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  appleRegister: (identityToken: string, givenName: string | undefined, familyName: string | undefined, businessData: AppleRegisterData, rawNonce?: string) => Promise<{ success: boolean; error?: string; rawError?: unknown }>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<Merchant | null>;
  updateMerchant: (data: Partial<Merchant>) => void;
}

/** Actions-only slice — stable across re-renders. */
type AuthActions = Pick<
  AuthContextData,
  | 'signIn'
  | 'register'
  | 'googleLogin'
  | 'appleLogin'
  | 'googleRegister'
  | 'appleRegister'
  | 'signOut'
  | 'loadProfile'
  | 'updateMerchant'
>;

/** State-only slice — read directly from Zustand. */
type AuthStateSlice = Pick<AuthContextData, 'merchant' | 'loading' | 'isTeamMember' | 'teamMember'>;

/** Shared business/store fields collected during any registration flow (email, Google, Apple). */
interface BusinessProfileData {
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
type GoogleRegisterData = BusinessProfileData;

/** Business info needed for Apple-based merchant registration */
type AppleRegisterData = BusinessProfileData;

/** Data for standard email/password registration */
interface RegisterData extends BusinessProfileData {
  email: string;
  password: string;
}

interface RegisterResponse {
  merchant: Merchant;
  userType: 'merchant';
  /** Always false while email verification is disabled server-side. */
  requiresEmailVerification: boolean;
  verificationSent: boolean;
}

const AuthContext = createContext<AuthContextData | null>(null);
const AuthActionsContext = createContext<AuthActions | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { merchant, loading, isTeamMember, teamMember } = useAuthState();

  const signOut = useCallback(async () => {
    try {
      // Clear the push token so this device stops receiving notifications.
      api.patch('/merchant/push-token', { pushToken: '' }).catch(() => {});
      resetMerchantPushTokenCache();
      // Fire-and-forget — don't block local cleanup on server response
      api.post('/auth/logout').catch(() => {});
      resetApiTokenCache();
      await clearStoredSession(['onboardingCompleted']);
      queryClient.clear();
      await AsyncStorage.removeItem('jitpluspro-query-cache').catch(() => {});
      useAuthStore.getState().reset();
      useAuthStore.getState().setLoading(false);
    } catch (error) {
      logError('Auth', 'Erreur lors de la déconnexion:', error);
    }
  }, [queryClient]);

  const loadProfile = useCallback(async (): Promise<Merchant | null> => {
    try {
      logInfo('Auth', 'Chargement du profil...');
      const response = await api.get<Merchant>('/merchant/profile');
      logInfo('Auth', 'Profil chargé:', response.data.nom);
      useAuthStore.getState().setMerchant(response.data);
      return response.data;
    } catch (error: unknown) {
      logError('Auth', 'Erreur profil:', error);
      // No signOut() here: the API interceptor handles 401s, and a network failure
      // must not log out an active user.
      throw error;
    }
  }, []);

  useEffect(() => {
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
            const profile = await loadProfileWithRetry(loadProfile);
            if (profile?.onboardingCompleted) {
              useAuthStore.getState().setOnboardingCompleted(true);
              await SecureStore.setItemAsync('onboardingCompleted', 'true');
            } else {
              useAuthStore.getState().setOnboardingCompleted(false);
              await SecureStore.deleteItemAsync('onboardingCompleted');
            }
            registerPushTokenInBackground();
          } catch (e) {
            logWarn(
              'Auth',
              isNetworkFailure(e)
                ? 'Serveur injoignable, profil non chargé'
                : 'Session expirée, retour à l\'écran de connexion',
            );
            return;
          }
        } else if (storedToken) {
          resetApiTokenCache();
          await clearStoredSession();
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
      resetMerchantPushTokenCache();
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
    resetApiTokenCache();
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
    } else {
      s.setOnboardingCompleted(false);
      await SecureStore.deleteItemAsync('onboardingCompleted');
    }

    registerPushTokenInBackground();
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
      const response = await api.post<RegisterResponse>('/auth/register', data);

      if (!response.data?.merchant) {
        throw new Error(i18n.t('auth.invalidServerResponse'));
      }

      logInfo('Auth', 'Inscription réussie:', response.data.merchant.nom);
    } catch (error: unknown) {
      logError('Auth', 'Erreur inscription:', error);
      throw error;
    }
  }, []);

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
    rawNonce?: string,
  ): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      logInfo('Auth', 'Apple login...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/apple-login', {
        identityToken,
        givenName,
        familyName,
        rawNonce,
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
    rawNonce?: string,
  ): Promise<{ success: boolean; error?: string; rawError?: unknown }> => {
    try {
      logInfo('Auth', 'Apple register...');
      const { deviceName, deviceOS } = getDeviceInfo();
      const deviceId = await getOrCreateDeviceId();
      const response = await api.post<AuthResponse>('/auth/apple-register', {
        identityToken,
        givenName,
        familyName,
        ...(rawNonce ? { rawNonce } : {}),
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


  const updateMerchant = useCallback((data: Partial<Merchant>) => {
    useAuthStore.getState().updateMerchant(data);
  }, []);

  const contextValue = useMemo<AuthContextData>(() => ({
    merchant,
    loading,
    isTeamMember,
    teamMember,
    signIn,
    register,
    googleLogin,
    appleLogin,
    googleRegister,
    appleRegister,
    signOut,
    loadProfile,
    updateMerchant,
  }), [merchant, loading, isTeamMember, teamMember, signIn, register, googleLogin, appleLogin, googleRegister, appleRegister, signOut, loadProfile, updateMerchant]);

  // Actions-only value: stable identity across state changes. Consumers using
  // useAuthActions() never re-render on auth state mutations.
  const actionsValue = useMemo<AuthActions>(() => ({
    signIn,
    register,
    googleLogin,
    appleLogin,
    googleRegister,
    appleRegister,
    signOut,
    loadProfile,
    updateMerchant,
  }), [signIn, register, googleLogin, appleLogin, googleRegister, appleRegister, signOut, loadProfile, updateMerchant]);

  return (
    <AuthActionsContext.Provider value={actionsValue}>
      <AuthContext.Provider value={contextValue}>
        {children}
      </AuthContext.Provider>
    </AuthActionsContext.Provider>
  );
};

/**
 * Legacy hook — returns the full auth context (causes re-render on ANY auth change).
 * For new code, prefer the granular hooks:
 *   const { merchant, loading } = useAuthState();   // subscribes to selected state slice
 *   const { signOut } = useAuthActions();           // stable identity, never re-renders
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};

/** Stable actions handle. Never re-renders the caller on state changes. */
export const useAuthActions = (): AuthActions => {
  const ctx = useContext(AuthActionsContext);
  if (!ctx) throw new Error('useAuthActions doit être utilisé dans un AuthProvider');
  return ctx;
};

/** Selective state subscription via Zustand shallow compare. */
export const useAuthState = (): AuthStateSlice =>
  useAuthStore(
    useShallow((s) => ({
      merchant: s.merchant,
      loading: s.loading,
      isTeamMember: s.isTeamMember,
      teamMember: s.teamMember,
    })),
  );
