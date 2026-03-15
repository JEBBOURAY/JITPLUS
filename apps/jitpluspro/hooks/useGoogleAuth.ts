/**
 * Shared Google authentication hook for JitPlus Pro (merchant app).
 * Uses expo-auth-session for Google Sign-In (works with Expo Go & dev builds).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorStatus } from '@/utils/error';

WebBrowser.maybeCompleteAuthSession();

// Prefer env var, fall back to value extracted from google-services.json via app.config.js
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.googleWebClientId
  || '';
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

/** Detect if a Google login error indicates no matching account */
function isNoAccountError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401) {
    const msg = (error as any)?.response?.data?.message ?? '';
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
  const processingRef = useRef(false);

  const [_gReq, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: WEB_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID || WEB_CLIENT_ID,
  });

  // Handle Google auth response
  useEffect(() => {
    if (!googleResponse || processingRef.current) return;

    if (googleResponse.type === 'success') {
      const idToken = googleResponse.params?.id_token;
      if (idToken) {
        processingRef.current = true;
        (async () => {
          const result = await googleLogin(idToken);
          setIsLoading(false);
          processingRef.current = false;
          if (result.success) {
            router.replace('/(tabs)');
          } else {
            // Detect "no account" scenario from raw error
            if (result.rawError && isNoAccountError(result.rawError)) {
              setNoAccount(true);
              setError(t('googleAuth.noAccountFound'));
            } else {
              setError(result.error || t('googleAuth.error'));
            }
            onCancel?.();
          }
        })();
      } else {
        setIsLoading(false);
        setError(t('googleAuth.noIdToken'));
        onCancel?.();
      }
    } else if (googleResponse.type === 'error') {
      setIsLoading(false);
      setError(t('googleAuth.error'));
      onCancel?.();
    } else {
      // dismissed / cancelled
      setIsLoading(false);
      onCancel?.();
    }
  }, [googleResponse, googleLogin, onCancel, t]);

  /** Launch the Google prompt */
  const promptGoogle = useCallback(async () => {
    setError('');
    setNoAccount(false);
    setIsLoading(true);

    if (!WEB_CLIENT_ID) {
      setIsLoading(false);
      setError(t('googleAuth.notConfigured'));
      return;
    }

    try {
      await promptGoogleAsync();
    } catch {
      setIsLoading(false);
      setError(t('googleAuth.launchError'));
    }
  }, [promptGoogleAsync, t]);

  /** Dismiss the no-account banner */
  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  return { isLoading, error, noAccount, setError, setIsLoading, promptGoogle, dismissNoAccount };
}
