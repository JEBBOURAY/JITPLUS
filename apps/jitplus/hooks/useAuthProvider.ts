/**
 * Shared state & lifecycle factory for social auth hooks (Google, Apple).
 * Eliminates duplicated state management, error handling, and navigation logic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { goHomeAfterLogin } from '@/services/pendingDeal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptic } from '@/utils/haptics';
import { isNoAccountError } from '@/utils/authErrors';
import i18n from '@/i18n';

const SHOW_WELCOME_KEY = 'showWelcome';

export interface AuthProviderOptions {
  actionLabel: string;
}

export interface AuthProviderResult {
  success: boolean;
  isNewUser?: boolean;
  error?: string;
  rawError?: unknown;
}

export interface AuthProviderState {
  isLoading: boolean;
  isSuccess: boolean;
  error: string;
  noAccount: boolean;
  mountedRef: React.MutableRefObject<boolean>;
  reset: () => void;
  setLoading: (v: boolean) => void;
  handleResult: (result: AuthProviderResult, errorKey: string) => Promise<void>;
  handleError: (errorKey: string) => void;
  dismissNoAccount: () => void;
}

export function useAuthProvider({ actionLabel }: AuthProviderOptions): AuthProviderState {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const reset = useCallback(() => {
    setError('');
    setIsSuccess(false);
    setNoAccount(false);
    setIsLoading(true);
  }, []);

  const handleResult = useCallback(async (result: AuthProviderResult, errorKey: string) => {
    if (!mountedRef.current) return;

    if (result.success) {
      setIsSuccess(true);
      // Keep the spinner active during the 600ms transition so the button cannot be re-tapped.
      setIsLoading(true);
      haptic();
      if (result.isNewUser) {
        setTimeout(() => {
          if (mountedRef.current) router.push('/complete-profile');
        }, 600);
      } else {
        await AsyncStorage.setItem(SHOW_WELCOME_KEY, '1');
        setTimeout(() => {
          if (mountedRef.current) goHomeAfterLogin(router);
        }, 600);
      }
    } else {
      setIsLoading(false);
      if (result.rawError && isNoAccountError(result.rawError)) {
        setNoAccount(true);
        setError(i18n.t(`${errorKey}.noAccountFound`));
      } else {
        setError(result.error || i18n.t(`${errorKey}.error`, { action: actionLabel }));
      }
    }
  }, [actionLabel]);

  const handleError = useCallback((errorKey: string) => {
    if (!mountedRef.current) return;
    setIsLoading(false);
    setError(i18n.t(`${errorKey}.error`, { action: actionLabel }));
  }, [actionLabel]);

  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  return useMemo(() => ({
    isLoading, isSuccess, error, noAccount, mountedRef,
    reset, setLoading: setIsLoading, handleResult, handleError, dismissNoAccount,
  }), [isLoading, isSuccess, error, noAccount, reset, handleResult, handleError, dismissNoAccount]);
}
