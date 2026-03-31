/**
 * Lightweight Google ID token capture hook for registration flow.
 * Unlike useGoogleAuth (login), this does NOT call any backend endpoint.
 * It only obtains the Google ID token so the register form can submit it later.
 *
 * Uses @react-native-google-signin/google-signin (native SDK) for production builds.
 * In Expo Go the native module is unavailable — the hook degrades gracefully.
 */
import { useCallback, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { WEB_CLIENT_ID } from '@/config/google';

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

if (GoogleSignin) {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });
}

interface UseGoogleIdTokenResult {
  isLoading: boolean;
  error: string;
  promptGoogle: () => Promise<void>;
}

export function useGoogleIdToken(onToken: (idToken: string) => void): UseGoogleIdTokenResult {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
      setError(t('googleAuth.notConfigured'));
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();

      // Clear cached account selection so the system chooser always appears
      try { await GoogleSignin.signOut(); } catch { /* no-op */ }

      const response = await GoogleSignin.signIn();

      // V16 API: cancellation returns { type: 'cancelled' }
      if ('type' in response && response.type === 'cancelled') {
        setIsLoading(false);
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        setIsLoading(false);
        setError(t('googleAuth.noIdToken'));
        return;
      }

      setIsLoading(false);
      onToken(idToken);
    } catch (err) {
      setIsLoading(false);

      if (isErrorWithCode && statusCodes && isErrorWithCode(err)) {
        if (
          err.code === statusCodes.SIGN_IN_CANCELLED ||
          err.code === statusCodes.IN_PROGRESS
        ) {
          return;
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError(t('googleAuth.playServicesUnavailable'));
          return;
        }
      }

      setError(t('googleAuth.launchError'));
    }
  }, [onToken, t]);

  return { isLoading, error, promptGoogle };
}
