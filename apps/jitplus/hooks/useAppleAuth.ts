/**
 * Apple Sign-In hook for the JitPlus client app.
 * Uses expo-apple-authentication to trigger the native Apple Sign-In flow on iOS.
 * On Android/web, Apple Sign-In is not available — the hook degrades gracefully.
 */
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthProvider } from './useAuthProvider';
import i18n from '@/i18n';

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
  const auth = useAuthProvider({ actionLabel, onCancel });

  const promptApple = useCallback(async () => {
    auth.reset();

    if (!AppleAuthentication || Platform.OS !== 'ios') {
      auth.setLoading(false);
      auth.handleError(null, 'appleAuth');
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
        auth.setLoading(false);
        auth.handleError(null, 'appleAuth');
        return;
      }

      const result = await appleLogin(
        credential.identityToken,
        credential.fullName?.givenName ?? undefined,
        credential.fullName?.familyName ?? undefined,
      );

      await auth.handleResult(result, 'appleAuth');
    } catch (e: unknown) {
      if (!auth.mountedRef.current) return;
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'ERR_REQUEST_CANCELED') {
        onCancel?.();
        auth.setLoading(false);
        return;
      }
      auth.handleError(e, 'appleAuth');
    } finally {
      if (auth.mountedRef.current) auth.setLoading(false);
    }
  }, [appleLogin, auth, onCancel]);

  /** True when Apple Sign-In is available on this device */
  const isAvailable = Platform.OS === 'ios' && !!AppleAuthentication;

  return {
    promptApple,
    isLoading: auth.isLoading,
    isSuccess: auth.isSuccess,
    error: auth.error,
    isAvailable,
    noAccount: auth.noAccount,
    dismissNoAccount: auth.dismissNoAccount,
  };
}
