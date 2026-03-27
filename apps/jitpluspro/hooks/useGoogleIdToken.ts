/**
 * Lightweight Google ID token capture hook for registration flow.
 * Unlike useGoogleAuth (login), this does NOT call any backend endpoint.
 * It only obtains the Google ID token so the register form can submit it later.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useLanguage } from '@/contexts/LanguageContext';
import { WEB_CLIENT_ID, IOS_CLIENT_ID } from '@/config/google';

WebBrowser.maybeCompleteAuthSession();

interface UseGoogleIdTokenResult {
  isLoading: boolean;
  error: string;
  promptGoogle: () => Promise<void>;
}

export function useGoogleIdToken(onToken: (idToken: string) => void): UseGoogleIdTokenResult {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const processingRef = useRef(false);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const [_gReq, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: WEB_CLIENT_ID,
    androidClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID || WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (!googleResponse || processingRef.current) return;

    if (googleResponse.type === 'success') {
      const idToken = googleResponse.params?.id_token;
      if (idToken) {
        processingRef.current = true;
        try {
          setIsLoading(false);
          onTokenRef.current(idToken);
        } finally {
          // Reset after callback completes to allow future prompts
          processingRef.current = false;
        }
      } else {
        setIsLoading(false);
        setError(t('googleAuth.noIdToken'));
      }
    } else if (googleResponse.type === 'error') {
      setIsLoading(false);
      setError(t('googleAuth.error'));
    } else {
      setIsLoading(false);
    }
  }, [googleResponse, t]);

  const promptGoogle = useCallback(async () => {
    setError('');
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

  return { isLoading, error, promptGoogle };
}
