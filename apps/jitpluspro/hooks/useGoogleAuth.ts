/**
 * Shared Google authentication hook for JitPlus Pro (merchant app).
 * Uses @react-native-google-signin/google-signin (native SDK) for production builds.
 * In Expo Go the native module is unavailable — the hook degrades gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { isAxiosError } from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorStatus } from '@/utils/error';
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

/** Detect if a Google login error indicates no matching account */
function isNoAccountError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401) {
    const msg = isAxiosError(error) ? (error.response?.data as { message?: string })?.message ?? '' : '';
    return /aucun compte|no account|compte.*trouvé/i.test(msg);
  }
  return false;
}

interface UseGoogleAuthOptions {
  /** Optional callback when the flow is cancelled or errors */
  onCancel?: () => void;
}

export function useGoogleAuth({ onCancel }: UseGoogleAuthOptions = {}) {
  const { googleLogin } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const mountedRef = useRef(true);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  /** Launch the Google prompt */
  const promptGoogle = useCallback(async () => {
    setError('');
    setNoAccount(false);
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
        onCancelRef.current?.();
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        setIsLoading(false);
        setError(t('googleAuth.noIdToken'));
        return;
      }

      const result = await googleLogin(idToken);

      if (!mountedRef.current) return;

      setIsLoading(false);
      if (result.success) {
        router.replace('/(tabs)');
      } else {
        if (result.rawError && isNoAccountError(result.rawError)) {
          setNoAccount(true);
          setError(t('googleAuth.noAccountFound'));
        } else {
          setError(result.error || t('googleAuth.error'));
        }
        onCancelRef.current?.();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setIsLoading(false);

      if (isErrorWithCode && statusCodes && isErrorWithCode(err)) {
        if (
          err.code === statusCodes.SIGN_IN_CANCELLED ||
          err.code === statusCodes.IN_PROGRESS
        ) {
          onCancelRef.current?.();
          return;
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError(t('googleAuth.playServicesUnavailable'));
          return;
        }
      }

      const nativeMsg = err instanceof Error ? err.message : String(err);
      const code = isErrorWithCode && isErrorWithCode(err) ? (err as any).code : '';
      const userMessage = t('googleAuth.launchError');
      if (__DEV__) {
        const detail = code ? `[${code}] ${nativeMsg}` : nativeMsg;
        setError(`${userMessage}\n${detail}`);
      } else {
        setError(userMessage);
      }
    }
  }, [googleLogin, t]);

  /** Dismiss the no-account banner */
  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  return { isLoading, error, noAccount, setError, setIsLoading, promptGoogle, dismissNoAccount };
}
