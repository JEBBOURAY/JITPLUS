/**
 * Shared Google authentication hook used by both login and register screens.
 * Uses @react-native-google-signin/google-signin (native SDK) for production builds.
 * In Expo Go the native module is unavailable — the hook degrades gracefully.
 */
import { useCallback } from 'react';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthProvider } from './useAuthProvider';
import i18n from '@/i18n';

// Lazy-load the native SDK so Expo Go doesn't crash at module evaluation time.
let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin | null = null;
let isErrorWithCode: typeof import('@react-native-google-signin/google-signin').isErrorWithCode | null = null;
let statusCodes: typeof import('@react-native-google-signin/google-signin').statusCodes | null = null;

try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;
  isErrorWithCode = mod.isErrorWithCode;
  statusCodes = mod.statusCodes;
} catch {
  // Native module unavailable (Expo Go) — GoogleSignin stays null
}

// Web client ID is needed so the native SDK returns an id_token (audience = web client).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.googleWebClientId
  || '';

if (GoogleSignin) {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });
}

interface UseGoogleAuthOptions {
  /** Label shown in error messages: "connexion" | "inscription" */
  actionLabel: string;
  /** Optional callback when the flow is cancelled or errors (e.g. handleBack) */
  onCancel?: () => void;
}

export function useGoogleAuth({ actionLabel, onCancel }: UseGoogleAuthOptions) {
  const { googleLogin } = useAuth();
  const auth = useAuthProvider({ actionLabel, onCancel });

  /** Launch the Google prompt */
  const promptGoogle = useCallback(async () => {
    auth.reset();

    if (!GoogleSignin || !isErrorWithCode || !statusCodes) {
      auth.setLoading(false);
      auth.handleError(null, 'googleAuth');
      return;
    }

    if (!WEB_CLIENT_ID) {
      auth.setLoading(false);
      auth.handleError(null, 'googleAuth');
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();

      // Sign out from the SDK first so Android always shows the account picker,
      // even if the user previously signed in with a Google account in this session.
      try { await GoogleSignin.signOut(); } catch { /* no-op when no account was cached */ }

      const response = await GoogleSignin.signIn();

      // V16 API: cancellation returns { type: 'cancelled' } instead of throwing
      if ('type' in response && response.type === 'cancelled') {
        auth.setLoading(false);
        onCancel?.();
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        auth.setLoading(false);
        auth.handleError(null, 'googleAuth');
        return;
      }

      const result = await googleLogin(idToken);
      auth.setLoading(false);
      await auth.handleResult(result, 'googleAuth');
    } catch (err) {
      auth.setLoading(false);

      if (isErrorWithCode && statusCodes && isErrorWithCode(err)) {
        if (
          err.code === statusCodes.SIGN_IN_CANCELLED ||
          err.code === statusCodes.IN_PROGRESS
        ) {
          onCancel?.();
          return;
        }

        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          auth.handleError(err, 'googleAuth');
          return;
        }
      }

      // Show user-friendly message; include native details only in development
      const nativeMsg = err instanceof Error ? err.message : String(err);
      const code = isErrorWithCode && isErrorWithCode(err) ? (err as { code: string }).code : '';
      const userMessage = i18n.t('googleAuth.launchError', { action: actionLabel });
      if (__DEV__) {
        const detail = code ? `[${code}] ${nativeMsg}` : nativeMsg;
        auth.handleError(new Error(`${userMessage}\n${detail}`), 'googleAuth');
      } else {
        auth.handleError(err, 'googleAuth');
      }
    }
  }, [actionLabel, googleLogin, onCancel, auth]);

  return {
    isLoading: auth.isLoading,
    isSuccess: auth.isSuccess,
    error: auth.error,
    setError: (e: string) => auth.handleError(new Error(e), 'googleAuth'),
    setIsLoading: auth.setLoading,
    promptGoogle,
    noAccount: auth.noAccount,
    dismissNoAccount: auth.dismissNoAccount,
  };
}
