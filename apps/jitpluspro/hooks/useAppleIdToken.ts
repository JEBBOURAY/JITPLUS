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
import * as Crypto from 'expo-crypto';
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
  /** Raw nonce used to derive the SHA-256 hash sent to Apple. Backend verifies replay. */
  rawNonce: string;
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

    try {
      if (!AppleAuthentication || Platform.OS !== 'ios') {
        setError(t('appleAuth.notAvailable'));
        return;
      }

      // Generate a cryptographically secure raw nonce, send sha256(rawNonce) to Apple,
      // and forward the raw nonce to the backend so it can verify the JWT `nonce` claim.
      // Prevents replay attacks during the 10-minute Apple identity token validity window.
      const rawNonce = Crypto.randomUUID() + Crypto.randomUUID().replace(/-/g, '');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        setError(t('appleAuth.noToken'));
        return;
      }

      onToken({
        identityToken: credential.identityToken,
        givenName: credential.fullName?.givenName ?? undefined,
        familyName: credential.fullName?.familyName ?? undefined,
        rawNonce,
      });
    } catch (e: unknown) {
      const code = (e as { code?: string } | null)?.code;
      if (code === 'ERR_REQUEST_CANCELED') {
        return; // User cancelled — no error
      }
      setError(t('appleAuth.error'));
    } finally {
      setIsLoading(false);
    }
  }, [onToken, t]);

  return { promptApple, isLoading, error, isAvailable };
}
