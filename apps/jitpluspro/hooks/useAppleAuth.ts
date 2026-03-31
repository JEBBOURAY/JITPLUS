/**
 * Apple Sign-In hook for JitPlus Pro (merchant app).
 * Uses expo-apple-authentication — only available on iOS 13+.
 * On Android/web, the hook returns a no-op.
 */
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { isAxiosError } from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorStatus } from '@/utils/error';

/** Detect if an Apple login error indicates no matching account */
function isNoAccountError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401) {
    const msg = isAxiosError(error) ? (error.response?.data as { message?: string })?.message ?? '' : '';
    return /aucun compte|no account|compte.*trouvé/i.test(msg);
  }
  return false;
}

interface UseAppleAuthOptions {
  onCancel?: () => void;
}

export function useAppleAuth({ onCancel }: UseAppleAuthOptions = {}) {
  const { appleLogin } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const processingRef = useRef(false);

  /** True if Apple Sign-In is available (iOS 13+) */
  const isAvailable = Platform.OS === 'ios';

  const promptApple = useCallback(async () => {
    if (processingRef.current) return;
    setError('');
    setNoAccount(false);
    setIsLoading(true);

    if (Platform.OS !== 'ios') {
      setIsLoading(false);
      setError(t('appleAuth.notAvailable'));
      return;
    }

    try {
      // Dynamic import so Android doesn't crash
      const AppleAuthentication = await import('expo-apple-authentication');

      const isAvail = await AppleAuthentication.isAvailableAsync();
      if (!isAvail) {
        setIsLoading(false);
        setError(t('appleAuth.notAvailable'));
        return;
      }

      processingRef.current = true;

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const identityToken = credential.identityToken;
      if (!identityToken) {
        setIsLoading(false);
        setError(t('appleAuth.noToken'));
        processingRef.current = false;
        onCancel?.();
        return;
      }

      // Apple only provides the name on the FIRST authorization
      const givenName = credential.fullName?.givenName ?? undefined;
      const familyName = credential.fullName?.familyName ?? undefined;

      const result = await appleLogin(identityToken, givenName, familyName);
      setIsLoading(false);

      if (result.success) {
        router.replace('/(tabs)');
      } else {
        if (result.rawError && isNoAccountError(result.rawError)) {
          setNoAccount(true);
          setError(t('appleAuth.noAccountFound'));
        } else {
          setError(result.error || t('appleAuth.error'));
        }
        onCancel?.();
      }
    } catch (err: any) {
      setIsLoading(false);
      // User cancelled the Apple prompt
      if (err.code === 'ERR_REQUEST_CANCELED' || err.code === 'ERR_CANCELED') {
        onCancel?.();
      } else {
        setError(t('appleAuth.error'));
        onCancel?.();
      }
    } finally {
      processingRef.current = false;
    }
  }, [appleLogin, onCancel, t]);

  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  return { isLoading, isAvailable, error, noAccount, setError, setIsLoading, promptApple, dismissNoAccount };
}
