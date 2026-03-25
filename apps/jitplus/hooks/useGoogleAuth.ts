/**
 * Shared Google authentication hook used by both login and register screens.
 * Uses expo-auth-session for Google Sign-In (works with Expo Go & dev builds).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import i18n from '@/i18n';

WebBrowser.maybeCompleteAuthSession();

// Prefer env var, fall back to value extracted from google-services.json via app.config.js.
// IMPORTANT: expo-auth-session uses a browser-based OAuth flow (Chrome Custom Tab).
// On Android, we use the Web client ID because:
//  - Android client IDs require SHA-1 validation of the app's signing key
//  - Google Play App Signing re-signs the app with a different key than the upload key
//  - The Web client ID works without SHA-1 validation in browser flows
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.googleWebClientId
  || '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

interface UseGoogleAuthOptions {
  /** Label shown in error messages: "connexion" | "inscription" */
  actionLabel: string;
  /** Optional callback when the flow is cancelled or errors (e.g. handleBack) */
  onCancel?: () => void;
}

export function useGoogleAuth({ actionLabel, onCancel }: UseGoogleAuthOptions) {
  const { googleLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const processingRef = useRef(false);

  const [_gReq, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID || WEB_CLIENT_ID,
  });

  // Handle Google auth response
  useEffect(() => {
    if (!googleResponse || processingRef.current) return;

    if (googleResponse.type === 'success') {
      const idToken = googleResponse.params?.id_token;
      if (idToken) {
        processingRef.current = true;
        (async () => {
          const result = await googleLogin(idToken);
          setIsLoading(false);
          processingRef.current = false;
          if (result.success) {
            if (result.isNewUser) router.push('/complete-profile');
            else router.replace('/(tabs)/qr');
          } else {
            setError(result.error || i18n.t('googleAuth.error', { action: actionLabel }));
            onCancel?.();
          }
        })();
      } else {
        setIsLoading(false);
        setError(i18n.t('googleAuth.noIdToken'));
        onCancel?.();
      }
    } else if (googleResponse.type === 'error') {
      setIsLoading(false);
      setError(i18n.t('googleAuth.error', { action: actionLabel }));
      onCancel?.();
    } else {
      // dismissed / cancelled
      setIsLoading(false);
      onCancel?.();
    }
  }, [googleResponse, googleLogin, actionLabel, onCancel]);

  /** Launch the Google prompt */
  const promptGoogle = useCallback(async () => {
    setError('');
    setIsLoading(true);

    if (!WEB_CLIENT_ID) {
      setIsLoading(false);
      setError(i18n.t('googleAuth.notConfigured'));
      return;
    }

    try {
      await promptGoogleAsync();
    } catch {
      setIsLoading(false);
      setError(i18n.t('googleAuth.launchError', { action: actionLabel }));
    }
  }, [actionLabel, promptGoogleAsync]);

  return { isLoading, error, setError, setIsLoading, promptGoogle };
}
