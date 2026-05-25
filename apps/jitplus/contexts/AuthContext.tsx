import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { api } from '@/services/api';
import { Client } from '@/types';
import { logInfo, logWarn } from '@/utils/devLogger';
import { useAuthStore } from '@/stores/authStore';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { useAuthMethods } from '@/hooks/useAuthMethods';

/** Decode JWT exp claim without a library. Returns epoch seconds or null. */
function getJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch { return null; }
}

/** Returns true if the JWT is expired (with 30s safety margin) */
function isTokenExpired(token: string): boolean {
  const exp = getJwtExp(token);
  if (!exp) return true; // malformed token → treat as expired
  return exp < Date.now() / 1000 - 30;
}

interface AuthContextType {
  client: Client | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  isGuest: boolean;
  needsPasswordSetup: boolean;
  enterGuestMode: () => void;
  sendOtpEmail: (email: string, isRegister?: boolean) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  verifyOtpEmail: (email: string, code: string, isRegister?: boolean) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;
  loginWithEmail: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  resetPasswordOtp: (password: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string; rawError?: unknown }>;
  appleLogin: (identityToken: string, givenName?: string, familyName?: string, rawNonce?: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string; rawError?: unknown }>;
  completeProfile: (prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useAuthStore((s) => s);
  const sessionVersionRef = useRef(0);

  // ── Restore stored session on mount + wire 401 handler ──
  useEffect(() => {
    api.setOnUnauthorized(() => { store.setClient(null); });

    let cancelled = false;
    const version = sessionVersionRef.current;

    const loadStoredAuth = async () => {
      try {
        logInfo('Auth', 'Chargement de l\'authentification...');
        const [storedNeedsPw, rememberMe, token, cachedProfile] = await Promise.all([
          api.getEmailOtpNewUser(), api.getRememberMe(), api.getStoredToken(),
          api.getCachedProfile<Client>(),
        ]);
        if (cancelled || sessionVersionRef.current !== version) return;
        if (storedNeedsPw) store.setNeedsPasswordSetup(true);

        if (token && rememberMe) {
          // Offline-first: hydrate from cached profile immediately so the user
          // sees their account (and QR) even with no network. The fetch below
          // will refresh it in the background.
          if (cachedProfile?.id) {
            store.setClient(cachedProfile);
            logInfo('Auth', 'Profil restauré depuis le cache:', cachedProfile.prenom, cachedProfile.nom);
          }

          // SECURITY: Pre-check JWT expiry to avoid unnecessary API calls with expired tokens.
          // If expired, the interceptor will attempt refresh automatically via getProfile().
          if (isTokenExpired(token)) {
            logInfo('Auth', 'Token expiré, tentative de rafraîchissement...');
          }
          logInfo('Auth', 'Token trouvé, restauration session...');
          try {
            const profile = await api.getProfile();
            if (cancelled || sessionVersionRef.current !== version) return;
            if (profile?.id) {
              store.setClient(profile);
              await api.setCachedProfile(profile);
              logInfo('Auth', 'Profil restauré:', profile.prenom, profile.nom);
            } else if (!cachedProfile?.id) {
              await api.clearAuth();
            }
          } catch (fetchErr: unknown) {
            // Only clear auth on explicit 401 (token actually invalid). Network
            // errors / timeouts must NOT log the user out — they keep the
            // cached profile so they can use the app (notably the QR) offline.
            const status = (fetchErr as { response?: { status?: number } })?.response?.status;
            if (status === 401) {
              await api.clearAuth();
              store.setClient(null);
              logInfo('Auth', 'Session expirée (401), déconnexion');
            } else if (!cachedProfile?.id) {
              // No cache + network error: stay anonymous but keep token for next launch
              logWarn('Auth', 'Profil indisponible (hors-ligne) et aucun cache');
            } else {
              logInfo('Auth', 'Profil indisponible (hors-ligne), utilisation du cache');
            }
          }
        } else if (token) {
          await api.clearAuth();
        }
      } catch (error: unknown) {
        if (cancelled || sessionVersionRef.current !== version) return;
        logWarn('Auth', 'Erreur restauration session:', error);
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

  // ── Keep offline profile cache in sync with the store ──
  // Writes the latest client snapshot to SecureStore whenever it changes so a
  // subsequent cold-start (even without network) can hydrate the user instantly.
  useEffect(() => {
    if (store.client?.id) {
      api.setCachedProfile(store.client).catch(() => { /* non-fatal */ });
    }
  }, [store.client]);

  // ── Push notifications ──
  usePushRegistration(store.client?.id);

  // ── Auth methods (extracted hook) ──
  const methods = useAuthMethods(store, sessionVersionRef);

  const value = useMemo<AuthContextType>(() => ({
    client: store.client,
    isLoading: store.loading,
    isAuthenticated: !!store.client,
    isProfileComplete: !!store.client?.nom && !!store.client?.prenom && (store.client?.termsAccepted !== false),
    isGuest: store.isGuest,
    needsPasswordSetup: store.needsPasswordSetup,
    ...methods,
  }), [store.client, store.loading, store.needsPasswordSetup, store.isGuest, methods]);

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
