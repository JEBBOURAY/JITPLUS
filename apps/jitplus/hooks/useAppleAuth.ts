/**
 * Apple Sign-In hook for the JitPlus client app.
 * Uses expo-apple-authentication to trigger the native Apple Sign-In flow on iOS.
 * On Android/web, Apple Sign-In is not available — the hook degrades gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { haptic } from '@/utils/haptics';
import { isNoAccountError } from '@/utils/authErrors';
import i18n from '@/i18n';

const SHOW_WELCOME_KEY = 'showWelcome';

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
  /** Label shown in error messages */
  actionLabel: string;
  /** Optional callback when the flow is cancelled */
  onCancel?: () => void;
}

export function useAppleAuth({ actionLabel, onCancel }: UseAppleAuthOptions) {
  const { appleLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const promptApple = useCallback(async () => {
    setError('');
    setIsSuccess(false);
    setNoAccount(false);
    setIsLoading(true);

    if (!AppleAuthentication || Platform.OS !== 'ios') {
      setIsLoading(false);
      setError(i18n.t('appleAuth.notAvailable'));
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
        setError(i18n.t('appleAuth.noToken'));
        return;
      }

      const result = await appleLogin(
        credential.identityToken,
        credential.fullName?.givenName ?? undefined,
        credential.fullName?.familyName ?? undefined,
      );

      if (!mountedRef.current) return;

      if (result.success) {
        setIsSuccess(true);
        haptic();
        await AsyncStorage.setItem(SHOW_WELCOME_KEY, '1');
        setTimeout(() => {
          if (mountedRef.current) router.replace('/(tabs)/qr');
        }, 600);
      } else {
        if (result.rawError && isNoAccountError(result.rawError)) {
          setNoAccount(true);
          setError(i18n.t('appleAuth.noAccountFound'));
        } else {
          setError(result.error || i18n.t('appleAuth.error', { action: actionLabel }));
        }
      }
    } catch (e: any) {
      if (!mountedRef.current) return;
      if (e.code === 'ERR_REQUEST_CANCELED') {
        onCancel?.();
        setIsLoading(false);
        return;
      }
      setError(i18n.t('appleAuth.error', { action: actionLabel }));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [appleLogin, actionLabel, onCancel]);

  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  /** True when Apple Sign-In is available on this device */
  const isAvailable = Platform.OS === 'ios' && !!AppleAuthentication;

  return { promptApple, isLoading, isSuccess, error, isAvailable, noAccount, dismissNoAccount };
}
