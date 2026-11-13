/**
 * Apple login for JitPlus Pro (merchant app): native prompt (iOS only), then the backend.
 * On Android/web Apple Sign-In is not available and the hook degrades gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAppleSignInAvailable, requestAppleCredential } from '@/utils/socialSignIn';
import { isNoAccountError } from '@/utils/authErrors';
import { hapticSuccess } from '@/utils/haptics';

export function useAppleAuth() {
  const { appleLogin } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const promptApple = useCallback(async () => {
    setError('');
    setNoAccount(false);
    setIsLoading(true);

    const outcome = await requestAppleCredential(t);
    if (!mountedRef.current) return;
    if (!outcome.ok) {
      setIsLoading(false);
      if (outcome.error) setError(outcome.error);
      return;
    }

    const { identityToken, givenName, familyName, rawNonce } = outcome.value;
    let result: Awaited<ReturnType<typeof appleLogin>>;
    try {
      result = await appleLogin(identityToken, givenName, familyName, rawNonce);
    } catch {
      if (mountedRef.current) {
        setIsLoading(false);
        setError(t('appleAuth.error'));
      }
      return;
    }
    if (!mountedRef.current) return;

    if (result.success) {
      // Keep the spinner during navigation to avoid a brief re-enable flicker
      hapticSuccess();
      router.replace('/(tabs)');
      return;
    }
    setIsLoading(false);
    if (result.rawError && isNoAccountError(result.rawError)) {
      setNoAccount(true);
      setError(t('appleAuth.noAccountFound'));
    } else {
      setError(result.error || t('appleAuth.error'));
    }
  }, [appleLogin, t]);

  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  return { promptApple, isLoading, error, isAvailable: isAppleSignInAvailable, noAccount, dismissNoAccount };
}
