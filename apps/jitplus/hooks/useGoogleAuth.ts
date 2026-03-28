/**
 * Shared Google authentication hook used by both login and register screens.
 * Uses @react-native-google-signin/google-signin (native SDK) for production builds.
 * In Expo Go the native module is unavailable — the hook degrades gracefully.
 */
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  /** Launch the Google prompt */
  const promptGoogle = useCallback(async () => {
    setError('');
    setIsLoading(true);

    if (!GoogleSignin || !isErrorWithCode || !statusCodes) {
      setIsLoading(false);
      setError('Google Sign-In n\'est pas disponible dans Expo Go. Utilisez un build de développement.');
      return;
    }

    if (!WEB_CLIENT_ID) {
      setIsLoading(false);
      setError(i18n.t('googleAuth.notConfigured'));
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      // V16 API: cancellation returns { type: 'cancelled' } instead of throwing
      if ('type' in response && response.type === 'cancelled') {
        setIsLoading(false);
        onCancel?.();
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        setIsLoading(false);
        setError(i18n.t('googleAuth.noIdToken'));
        // Don't call onCancel — keep user on Google screen so they can see the error
        return;
      }

      const result = await googleLogin(idToken);
      setIsLoading(false);

      if (result.success) {
        if (result.isNewUser) router.push('/complete-profile');
        else router.replace('/(tabs)/qr');
      } else {
        setError(result.error || i18n.t('googleAuth.error', { action: actionLabel }));
        // Don't call onCancel — let user see the error and retry
      }
    } catch (err) {
      setIsLoading(false);

      if (isErrorWithCode && statusCodes && isErrorWithCode(err)) {
        if (
          err.code === statusCodes.SIGN_IN_CANCELLED ||
          err.code === statusCodes.IN_PROGRESS
        ) {
          // User explicitly cancelled or another sign-in is in progress — go back
          onCancel?.();
          return;
        }

        // DEVELOPER_ERROR (code 10) = SHA-1 fingerprint mismatch between
        // signing key and Google Cloud Console, or wrong webClientId.
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError(i18n.t('googleAuth.playServicesUnavailable'));
          return;
        }
      }

      // Include native error details so the user (developer) can diagnose
      const nativeMsg = err instanceof Error ? err.message : String(err);
      const code = isErrorWithCode && isErrorWithCode(err) ? (err as any).code : '';
      const detail = code ? `[${code}] ${nativeMsg}` : nativeMsg;
      setError(`${i18n.t('googleAuth.launchError', { action: actionLabel })}\n${detail}`);
      // Don't call onCancel — let user see the error and retry
    }
  }, [actionLabel, googleLogin, onCancel]);

  return { isLoading, error, setError, setIsLoading, promptGoogle };
}
