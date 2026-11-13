/**
 * Apple identity token capture for the registration flow: unlike useAppleAuth
 * (login) it calls no backend endpoint, the register form submits the token later.
 * iOS only; elsewhere isAvailable is false.
 */
import { useCallback, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAppleSignInAvailable, requestAppleCredential, type AppleTokenData } from '@/utils/socialSignIn';

interface UseAppleIdTokenResult {
  isLoading: boolean;
  error: string;
  isAvailable: boolean;
  promptApple: () => Promise<void>;
}

export function useAppleIdToken(onToken: (data: AppleTokenData) => void): UseAppleIdTokenResult {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const promptApple = useCallback(async () => {
    setError('');
    setIsLoading(true);
    const outcome = await requestAppleCredential(t);
    setIsLoading(false);
    if (outcome.ok) onToken(outcome.value);
    else if (outcome.error) setError(outcome.error);
  }, [onToken, t]);

  return { promptApple, isLoading, error, isAvailable: isAppleSignInAvailable };
}
