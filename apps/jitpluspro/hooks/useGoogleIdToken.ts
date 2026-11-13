/**
 * Google ID token capture for the registration flow: unlike useGoogleAuth
 * (login) it calls no backend endpoint, the register form submits the token later.
 */
import { useCallback, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { requestGoogleIdToken } from '@/utils/socialSignIn';

interface UseGoogleIdTokenResult {
  isLoading: boolean;
  error: string;
  promptGoogle: () => Promise<void>;
}

export function useGoogleIdToken(onToken: (idToken: string) => void): UseGoogleIdTokenResult {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const promptGoogle = useCallback(async () => {
    setError('');
    setIsLoading(true);
    const outcome = await requestGoogleIdToken(t);
    setIsLoading(false);
    if (outcome.ok) onToken(outcome.value);
    else if (outcome.error) setError(outcome.error);
  }, [onToken, t]);

  return { isLoading, error, promptGoogle };
}
