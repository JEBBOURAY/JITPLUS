/**
 * Shared state & lifecycle factory for social auth hooks (Google, Apple).
 * Eliminates duplicated state management, error handling, and navigation logic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { goHomeAfterLogin } from '@/services/pendingDeal';
import { flagHomeWelcome } from '@/hooks/useHomeBanners';
import { haptic } from '@/utils/haptics';
import { isNoAccountError } from '@/utils/authErrors';
import i18n from '@/i18n';


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
  error: string;
  mountedRef: React.MutableRefObject<boolean>;
  reset: () => void;
  setLoading: (v: boolean) => void;
  handleResult: (result: AuthProviderResult, errorKey: string) => Promise<void>;
  handleError: (errorKey: string) => void;
}

export function useAuthProvider({ actionLabel }: AuthProviderOptions): AuthProviderState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const reset = useCallback(() => {
    setError('');
    setIsLoading(true);
  }, []);

  const handleResult = useCallback(async (result: AuthProviderResult, errorKey: string) => {
    if (!mountedRef.current) return;

    if (result.success) {
      // Keep the spinner active during the 600ms transition so the button cannot be re-tapped.
      setIsLoading(true);
      haptic();
      if (result.isNewUser) {
        setTimeout(() => {
          if (mountedRef.current) router.push('/complete-profile');
        }, 600);
      } else {
        await flagHomeWelcome('back');
        setTimeout(() => {
          if (mountedRef.current) goHomeAfterLogin(router);
        }, 600);
      }
    } else {
      setIsLoading(false);
      if (result.rawError && isNoAccountError(result.rawError)) {
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

  return useMemo(() => ({
    isLoading, error, mountedRef,
    reset, setLoading: setIsLoading, handleResult, handleError,
  }), [isLoading, error, reset, handleResult, handleError]);
}
