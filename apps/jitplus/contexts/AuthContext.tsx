import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { purgeClientSessionAfterReinstall } from '@/services/api/storage';
import { loadProfile } from '@/services/profileLoad';
import { Client } from '@/types';
import { logInfo, logWarn } from '@/utils/devLogger';
import { useAuthStore } from '@/stores/authStore';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { useAuthMethods } from '@/hooks/useAuthMethods';

interface AuthContextType {
  client: Client | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sendOtpEmail: (email: string, isRegister?: boolean) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean; code?: string }>;
  verifyOtpEmail: (email: string, code: string, isRegister?: boolean) => Promise<{ success: boolean; isNewUser?: boolean; needsPassword?: boolean; error?: string; isNetworkError?: boolean; code?: string }>;
  verifyOtpForReset: (email: string, code: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean; code?: string }>;
  loginWithEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  resetPasswordOtp: (password: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean; sessionExpired?: boolean }>;
  cancelPasswordReset: () => Promise<void>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string; rawError?: unknown }>;
  appleLogin: (identityToken: string, givenName?: string, familyName?: string, rawNonce?: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string; rawError?: unknown }>;
  completeProfile: (prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string) => Promise<{ success: boolean; error?: string; isNetworkError?: boolean }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

/** Waits before re-fetching the profile when the server was unreachable at launch. */
const PROFILE_RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Narrow selectors: the provider re-renders only when the client or loading
  // flag changes (actions are stable).
  const client = useAuthStore((s) => s.client);
  const loading = useAuthStore((s) => s.loading);
  const setClient = useAuthStore((s) => s.setClient);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setNeedsPasswordSetup = useAuthStore((s) => s.setNeedsPasswordSetup);
  const setSignupTermsAccepted = useAuthStore((s) => s.setSignupTermsAccepted);
  const reset = useAuthStore((s) => s.reset);
  const sessionVersionRef = useRef(0);
  const methods = useAuthMethods({ setClient, setNeedsPasswordSetup, setSignupTermsAccepted, reset }, sessionVersionRef);
  const { clearLocalSession } = methods;

  // ── Restore stored session on mount ──
  useEffect(() => {
    let cancelled = false;
    const version = sessionVersionRef.current;
    // False once unmounted or after a sign-in / sign-out: a late answer must not touch the new session.
    const isCurrent = () => !cancelled && sessionVersionRef.current === version;
    let profileRetryTimer: ReturnType<typeof setTimeout> | null = null;

    // The server was unreachable at launch (offline, backend still starting):
    // the cached profile is shown, but it lacks the contact details and may be
    // stale. Fetch the real one once the server answers, instead of waiting
    // for the next launch.
    const retryProfileLater = (attempt: number) => {
      if (attempt >= PROFILE_RETRY_DELAYS_MS.length) return;
      profileRetryTimer = setTimeout(async () => {
        profileRetryTimer = null;
        if (!isCurrent()) return;
        const result = await loadProfile();
        if (!isCurrent()) return;
        if (result.status === 'ok') {
          setClient(result.profile);
          logInfo('Auth', 'Profil rechargé après retour du réseau');
        } else if (result.status === 'unauthorized') {
          // Signed in from the cache, a rejected session is ended by the API
          // client (onUnauthorized). Without a cached profile there is no client,
          // so onUnauthorized does nothing: drop the dead tokens here.
          if (!useAuthStore.getState().client) await api.clearAuth().catch(() => {});
        } else if (result.status === 'offline') {
          retryProfileLater(attempt + 1);
        }
      }, PROFILE_RETRY_DELAYS_MS[attempt]);
    };

    const loadStoredAuth = async () => {
      try {
        logInfo('Auth', 'Chargement de l\'authentification...');
        // Before any keychain read: a reinstall must not reopen the old account.
        await purgeClientSessionAfterReinstall();
        if (!isCurrent()) return;
        // Leftover of the removed "Explore without an account" mode (gone after app 1.5.6).
        AsyncStorage.removeItem('guest_mode').catch(() => {});
        const [storedNeedsPw, token, cachedProfile] = await Promise.all([
          api.getEmailOtpNewUser(), api.getToken(), api.getCachedProfile<Client>(),
        ]);
        if (!isCurrent()) return;
        if (storedNeedsPw) setNeedsPasswordSetup(true);

        // Sessions always persist (like JitPlus Pro): a stored token is enough to
        // restore, including OTP logins that never wrote the rememberMe flag.
        if (token) {
          // Offline-first: hydrate from cached profile immediately so the user
          // sees their account (and QR) even with no network. The fetch below
          // will refresh it in the background.
          if (cachedProfile?.id) {
            setClient(cachedProfile);
            logInfo('Auth', 'Profil restauré depuis le cache:', cachedProfile.prenom, cachedProfile.nom);
            // Open the app now: the profile fetch below refreshes it in the
            // background (a 401 still logs out through clearLocalSession), so a
            // slow network or a Cloud Run cold start no longer holds the splash.
            setLoading(false);
          }

          // An expired access token is refreshed by the API client interceptor.
          logInfo('Auth', 'Token trouvé, restauration session...');
          const result = await loadProfile();
          if (!isCurrent()) return;
          if (result.status === 'ok') {
            setClient(result.profile);
            logInfo('Auth', 'Profil restauré:', result.profile.prenom, result.profile.nom);
          } else if (result.status === 'empty') {
            if (!cachedProfile?.id) await api.clearAuth();
          } else if (result.status === 'unauthorized') {
            // Only an explicit 401 (token actually invalid) clears the session.
            await clearLocalSession();
            logInfo('Auth', 'Session expirée (401), déconnexion');
          } else {
            // Network errors / timeouts must NOT log the user out: they keep the
            // cached profile so they can use the app (notably the QR) offline.
            // Without a cache they stay anonymous but keep the token for next launch.
            if (cachedProfile?.id) logInfo('Auth', 'Profil indisponible (hors-ligne), utilisation du cache');
            else logWarn('Auth', 'Profil indisponible (hors-ligne) et aucun cache');
            if (result.status === 'offline') retryProfileLater(0);
          }
        }
      } catch (error: unknown) {
        if (!isCurrent()) return;
        logWarn('Auth', 'Erreur restauration session:', error);
      } finally {
        if (isCurrent()) {
          logInfo('Auth', 'Chargement terminé');
          setLoading(false);
        }
      }
    };

    loadStoredAuth();
    return () => {
      cancelled = true;
      if (profileRetryTimer) clearTimeout(profileRetryTimer);
    };
  }, [clearLocalSession, setClient, setLoading, setNeedsPasswordSetup]);

  // ── Keep offline profile cache in sync with the store ──
  // Writes the latest client snapshot (reduced to non-contact fields, see
  // setCachedProfile) to AsyncStorage whenever it changes so a subsequent
  // cold-start (even without network) can hydrate the user instantly.
  // Debounced + content-deduped: we coalesce rapid updates (polling, WS,
  // profile patches) and skip writes when the snapshot hasn't actually changed.
  const lastCachedSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!client?.id) {
      // Otherwise re-logging into the same account would skip the cache write.
      lastCachedSnapshotRef.current = null;
      return;
    }
    const snapshot = JSON.stringify(client);
    if (snapshot === lastCachedSnapshotRef.current) return;
    const handle = setTimeout(() => {
      lastCachedSnapshotRef.current = snapshot;
      api.setCachedProfile(client).catch(() => { /* non-fatal */ });
    }, 1500);
    return () => clearTimeout(handle);
  }, [client]);

  // ── Push notifications ──
  usePushRegistration(client?.id);

  // A rejected refresh or a 401 must wipe the session as thoroughly as an explicit logout.
  // Signed out there is no session to end: a stray 401 (push-token rotation, a
  // late retry) must not wipe what a visitor keeps for after sign-up (pending
  // claim, parcel code, shared deal).
  useEffect(() => {
    api.setOnUnauthorized(() => {
      if (useAuthStore.getState().client) void clearLocalSession();
    });
  }, [clearLocalSession]);

  const value = useMemo<AuthContextType>(() => ({
    client,
    isLoading: loading,
    isAuthenticated: !!client,
    ...methods,
  }), [client, loading, methods]);

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
