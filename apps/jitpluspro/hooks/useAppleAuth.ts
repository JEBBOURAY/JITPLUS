/**
 * Apple Sign-In hook for the JitPlus Pro merchant app.
 * Uses expo-apple-authentication to trigger the native Apple Sign-In flow on iOS.
 * On Android/web, Apple Sign-In is not available — the hook degrades gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isNoAccountError } from '@/utils/authErrors';

// Lazy-load so Android/web doesn't crash
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
if (Platform.OS === 'ios') {
  try {
    AppleAuthentication = require('expo-apple-authentication');
  } catch {
    // Not available
  }
}

interface UseAppleAuthOptions {
  /** Optional callback when the flow is cancelled */
  onCancel?: () => void;
}

export function useAppleAuth({ onCancel }: UseAppleAuthOptions = {}) {
  const { appleLogin } = useAuth();
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

  const promptApple = useCallback(async () => {
    setError('');
    setNoAccount(false);
    setIsLoading(true);

    if (!AppleAuthentication || Platform.OS !== 'ios') {
      setIsLoading(false);
      setError(t('appleAuth.notAvailable'));
      return;
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        setIsLoading(false);
        setError(t('appleAuth.noToken'));
        return;
      }

      const result = await appleLogin(
        credential.identityToken,
        credential.fullName?.givenName ?? undefined,
        credential.fullName?.familyName ?? undefined,
      );

      if (!mountedRef.current) return;

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
        onCancelRef.current?.();
      }
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setIsLoading(false);

      const code = (e as { code?: string } | null)?.code;
      if (code === 'ERR_REQUEST_CANCELED') {
        onCancelRef.current?.();
        return;
      }
      setError(t('appleAuth.error'));
    }
  }, [appleLogin, t]);

  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  /** True when Apple Sign-In is available on this device */
  const isAvailable = Platform.OS === 'ios' && !!AppleAuthentication;

  return { promptApple, isLoading, isSuccess: false, error, isAvailable, noAccount, dismissNoAccount };
}
