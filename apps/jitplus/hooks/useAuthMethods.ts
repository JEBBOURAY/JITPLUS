import { useCallback, useMemo, MutableRefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { clearLocalSession as clearLocalSessionData } from '@/services/localSession';
import { notifyServerLogout } from '@/services/serverLogout';
import { extractErrorMessage, isNetworkError as checkNetworkError } from '@/utils/errorMessage';
import { logInfo, logError } from '@/utils/devLogger';
import type { AuthState } from '@/stores/authStore';

export function useAuthMethods(
  store: AuthState,
  sessionVersionRef: MutableRefObject<number>,
) {
  const queryClient = useQueryClient();

  const sendOtpEmail = useCallback(async (email: string, isRegister = false) => {
    try {
      await api.sendOtpEmail(email, isRegister);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const verifyOtpEmail = useCallback(async (email: string, code: string, isRegister = false) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.verifyOtpEmail(email, code, isRegister);
      store.setClient(response.client);
      logInfo('Auth', 'OTP email vérifié:', response.client?.prenom, '| nouveau:', response.isNewUser);
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
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.googleLogin(idToken);
      store.setClient(response.client);
      logInfo('Auth', 'Google login réussi:', response.client?.prenom, '| nouveau:', response.isNewUser);
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), rawError: error };
    }
  }, []);

  const appleLogin = useCallback(async (identityToken: string, givenName?: string, familyName?: string, rawNonce?: string) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.appleLogin(identityToken, givenName, familyName, rawNonce);
      store.setClient(response.client);
      logInfo('Auth', 'Apple login réussi:', response.client?.prenom, '| nouveau:', response.isNewUser);
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), rawError: error };
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.loginWithEmail(email, password);
      store.setClient(response.client);
      logInfo('Auth', 'Connexion email réussie:', response.client?.prenom);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const setPassword = useCallback(async (password: string) => {
    try {
      const response = await api.setPassword(password);
      store.setClient(response.client);
      await api.clearEmailOtpNewUser();
      store.setNeedsPasswordSetup(false);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const resetPasswordOtp = useCallback(async (password: string) => {
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
      if (password) {
        await api.clearEmailOtpNewUser();
        store.setNeedsPasswordSetup(false);
      }
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, []);

  const clearLocalSession = useCallback(
    () => clearLocalSessionData(queryClient, store.reset),
    [queryClient, store.reset],
  );

  const logout = useCallback(async () => {
    await notifyServerLogout();
    await clearLocalSession();
    logInfo('Auth', 'Déconnexion terminée');
  }, [clearLocalSession]);

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
          await clearLocalSession();
        }
      }
      logError('Auth', 'Erreur rafraîchissement profil:', error);
    }
  }, [clearLocalSession]);

  const enterGuestMode = useCallback(() => {
    store.setGuest(true);
  }, []);

  return useMemo(() => ({
    sendOtpEmail, verifyOtpEmail, googleLogin, appleLogin,
    loginWithEmail, setPassword, resetPasswordOtp, completeProfile,
    logout, refreshProfile, enterGuestMode, clearLocalSession,
  }), [
    sendOtpEmail, verifyOtpEmail, googleLogin, appleLogin,
    loginWithEmail, setPassword, resetPasswordOtp, completeProfile,
    logout, refreshProfile, enterGuestMode, clearLocalSession,
  ]);
}
