/**
 * Lightweight Apple identity token capture hook for registration flow.
 * Unlike useAppleAuth (login), this does NOT call any backend endpoint.
 * It only obtains the Apple identity token so the register form can submit it later.
 *
 * Uses expo-apple-authentication (native SDK) — iOS only.
 * On Android/web the hook degrades gracefully (isAvailable = false).
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';

// Lazy-load so Android/web doesn't crash
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
if (Platform.OS === 'ios') {
  try {
    AppleAuthentication = require('expo-apple-authentication');
  } catch {
    // Not available
  }
}

interface AppleTokenData {
  identityToken: string;
  givenName?: string;
  familyName?: string;
}

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

  const isAvailable = Platform.OS === 'ios' && !!AppleAuthentication;

  const promptApple = useCallback(async () => {
    setError('');
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

      setIsLoading(false);
      onToken({
        identityToken: credential.identityToken,
        givenName: credential.fullName?.givenName ?? undefined,
        familyName: credential.fullName?.familyName ?? undefined,
      });
    } catch (e: any) {
      setIsLoading(false);

      if (e.code === 'ERR_REQUEST_CANCELED') {
        return; // User cancelled — no error
      }
      setError(t('appleAuth.error'));
    }
  }, [onToken, t]);

  return { promptApple, isLoading, error, isAvailable };
}
