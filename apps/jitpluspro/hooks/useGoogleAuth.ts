/**
 * Google login for JitPlus Pro (merchant app): native prompt, then the backend.
 * In Expo Go the native module is unavailable and the hook degrades gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { requestGoogleIdToken } from '@/utils/socialSignIn';
import { isNoAccountError } from '@/utils/authErrors';
import { hapticSuccess } from '@/utils/haptics';

export function useGoogleAuth() {
  const { googleLogin } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const promptGoogle = useCallback(async () => {
    setError('');
    setNoAccount(false);
    setIsLoading(true);

    const outcome = await requestGoogleIdToken(t);
    if (!outcome.ok) {
      if (!mountedRef.current) return;
      setIsLoading(false);
      if (outcome.error) setError(outcome.error);
      return;
    }

    const result = await googleLogin(outcome.value);
    if (!mountedRef.current) return;
    setIsLoading(false);
    if (result.success) {
      hapticSuccess();
      router.replace('/(tabs)');
    } else if (result.rawError && isNoAccountError(result.rawError)) {
      setNoAccount(true);
      setError(t('googleAuth.noAccountFound'));
    } else {
      setError(result.error || t('googleAuth.error'));
    }
  }, [googleLogin, t]);

  /** Dismiss the no-account banner */
  const dismissNoAccount = useCallback(() => {
    setNoAccount(false);
    setError('');
  }, []);

  return { isLoading, error, noAccount, promptGoogle, dismissNoAccount };
}
