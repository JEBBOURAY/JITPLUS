import { useCallback, useMemo, MutableRefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/services/api';
import { clearLocalSession as clearLocalSessionData } from '@/services/localSession';
import { notifyServerLogout } from '@/services/serverLogout';
import { extractErrorCode, extractErrorMessage, isNetworkError as checkNetworkError } from '@/utils/errorMessage';
import { loadProfile } from '@/services/profileLoad';
import { logInfo, logError } from '@/utils/devLogger';
import type { AuthState } from '@/stores/authStore';

/** The auth store actions the methods need (stable references). */
export type AuthActions = Pick<AuthState, 'setClient' | 'setNeedsPasswordSetup' | 'setSignupTermsAccepted' | 'reset'>;

export function useAuthMethods(
  actions: AuthActions,
  sessionVersionRef: MutableRefObject<number>,
) {
  const queryClient = useQueryClient();
  const { setClient, setNeedsPasswordSetup, setSignupTermsAccepted, reset } = actions;

  const sendOtpEmail = useCallback(async (email: string, isRegister = false) => {
    try {
      await api.sendOtpEmail(email, isRegister);
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: extractErrorMessage(error),
        isNetworkError: checkNetworkError(error),
        code: extractErrorCode(error),
      };
    }
  }, []);

  const verifyOtpEmail = useCallback(async (email: string, code: string, isRegister = false) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.verifyOtpEmail(email, code, isRegister);
      setClient(response.client);
      logInfo('Auth', 'OTP email vérifié:', response.client?.prenom, '| nouveau:', response.isNewUser);
      // The sign-up screen cannot send a code before its terms box is ticked.
      if (response.isNewUser && isRegister) setSignupTermsAccepted(true);
      // A resumed sign-up may already have a password (set through "forgot password").
      const needsPassword = response.isNewUser && isRegister && !response.client?.hasPassword;
      if (needsPassword) {
        await api.setEmailOtpNewUser();
        setNeedsPasswordSetup(true);
      }
      return { success: true, isNewUser: response.isNewUser, needsPassword };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), code: extractErrorCode(error) };
    }
  }, [setClient, setNeedsPasswordSetup, setSignupTermsAccepted, sessionVersionRef]);

  const googleLogin = useCallback(async (idToken: string) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.googleLogin(idToken);
      setClient(response.client);
      logInfo('Auth', 'Google login réussi:', response.client?.prenom, '| nouveau:', response.isNewUser);
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), rawError: error };
    }
  }, [setClient, sessionVersionRef]);

  const appleLogin = useCallback(async (identityToken: string, givenName?: string, familyName?: string, rawNonce?: string) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.appleLogin(identityToken, givenName, familyName, rawNonce);
      setClient(response.client);
      logInfo('Auth', 'Apple login réussi:', response.client?.prenom, '| nouveau:', response.isNewUser);
      return { success: true, isNewUser: response.isNewUser };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), rawError: error };
    }
  }, [setClient, sessionVersionRef]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(true);
      const response = await api.loginWithEmail(email, password);
      setClient(response.client);
      logInfo('Auth', 'Connexion email réussie:', response.client?.prenom);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, [setClient, sessionVersionRef]);

  /**
   * Forgot-password OTP check. The session stays in memory and the client is
   * not published: the app remains logged out (no socket, push prompt or
   * pending-claim redirect while the user types) until resetPasswordOtp
   * succeeds, and killing the app midway leaves no session on the device.
   */
  const verifyOtpForReset = useCallback(async (email: string, code: string) => {
    sessionVersionRef.current++;
    try {
      await api.setRememberMe(false);
      await api.verifyOtpEmail(email, code);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error), code: extractErrorCode(error) };
    }
  }, [sessionVersionRef]);

  const resetPasswordOtp = useCallback(async (password: string) => {
    try {
      const response = await api.resetPasswordOtp(password);
      await api.persistSession();
      setClient(response.client);
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: extractErrorMessage(error),
        isNetworkError: checkNetworkError(error),
        // 403: the OTP proof is spent or older than the server's reset window.
        sessionExpired: isAxiosError(error) && error.response?.status === 403,
      };
    }
  }, [setClient]);

  /** Forgets a reset session the user walked away from. Its tokens never left memory. */
  const cancelPasswordReset = useCallback(() => api.clearAuth(), []);

  const completeProfile = useCallback(async (prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string) => {
    try {
      const response = await api.completeProfile(prenom, nom, termsAccepted, telephone, dateNaissance, password);
      setClient(response.client);
      // The password step is over, whether a password was chosen or skipped.
      await api.clearEmailOtpNewUser();
      setNeedsPasswordSetup(false);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: extractErrorMessage(error), isNetworkError: checkNetworkError(error) };
    }
  }, [setClient, setNeedsPasswordSetup]);

  // A new session version voids every profile load still in flight (refresh,
  // offline retry): resolving after the wipe, it would bring the old client back.
  const clearLocalSession = useCallback(() => {
    sessionVersionRef.current++;
    return clearLocalSessionData(queryClient, reset);
  }, [queryClient, reset, sessionVersionRef]);

  const logout = useCallback(async () => {
    await notifyServerLogout();
    await clearLocalSession();
    logInfo('Auth', 'Déconnexion terminée');
  }, [clearLocalSession]);

  const refreshProfile = useCallback(async () => {
    try {
      const version = sessionVersionRef.current;
      const token = await api.getToken();
      if (!token) return;
      const result = await loadProfile();
      if (sessionVersionRef.current !== version) return;
      if (result.status === 'ok') {
        setClient(result.profile);
      } else if (result.status !== 'empty') {
        if (result.status === 'unauthorized') await clearLocalSession();
        logError('Auth', 'Erreur rafraîchissement profil:', result.error);
      }
    } catch (error: unknown) {
      logError('Auth', 'Erreur rafraîchissement profil:', error);
    }
  }, [clearLocalSession, setClient, sessionVersionRef]);

  return useMemo(() => ({
    sendOtpEmail, verifyOtpEmail, verifyOtpForReset, googleLogin, appleLogin,
    loginWithEmail, resetPasswordOtp, cancelPasswordReset, completeProfile,
    logout, refreshProfile, clearLocalSession,
  }), [
    sendOtpEmail, verifyOtpEmail, verifyOtpForReset, googleLogin, appleLogin,
    loginWithEmail, resetPasswordOtp, cancelPasswordReset, completeProfile,
    logout, refreshProfile, clearLocalSession,
  ]);
}
