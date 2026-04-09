/**
 * Shared Google authentication hook used by both login and register screens.
 * Uses @react-native-google-signin/google-signin (native SDK) for production builds.
 * In Expo Go the native module is unavailable — the hook degrades gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { haptic } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';
import i18n from '@/i18n';

// Lazy-load the native SDK so Expo Go doesn't crash at module evaluation time.
let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin | null = null;
let isErrorWithCode: typeof import('@react-native-google-signin/google-signin').isErrorWithCode | null = null;
let statusCodes: typeof import('@react-native-google-signin/google-signin').statusCodes | null = null;

try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;
  isErrorWithCode = mod.isErrorWithCode;
  statusCodes = mod.statusCodes;
} catch {
  // Native module unavailable (Expo Go) — GoogleSignin stays null
}

// Web client ID is needed so the native SDK returns an id_token (audience = web client).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.googleWebClientId
  || '';

if (GoogleSignin) {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });
}

interface UseGoogleAuthOptions {
  /** Label shown in error messages: "connexion" | "inscription" */
  actionLabel: string;
  /** Optional callback when the flow is cancelled or errors (e.g. handleBack) */
  onCancel?: () => void;
}

export function useGoogleAuth({ actionLabel, onCancel }: UseGoogleAuthOptions) {
  const { googleLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  /** Launch the Google prompt */
  const promptGoogle = useCallback(async () => {
    setError('');
    setIsSuccess(false);
    setIsLoading(true);

    if (!GoogleSignin || !isErrorWithCode || !statusCodes) {
      setIsLoading(false);
      setError('Google Sign-In n\'est pas disponible dans Expo Go. Utilisez un build de développement.');
      return;
    }

    if (!WEB_CLIENT_ID) {
      setIsLoading(false);
      setError(i18n.t('googleAuth.notConfigured'));
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();

      // Sign out from the SDK first so Android always shows the account picker,
      // even if the user previously signed in with a Google account in this session.
      // This does NOT revoke tokens or sign the user out of the app — it only
      // clears the SDK's cached account selection so the system chooser appears.
      try { await GoogleSignin.signOut(); } catch { /* no-op when no account was cached */ }

      const response = await GoogleSignin.signIn();

      // V16 API: cancellation returns { type: 'cancelled' } instead of throwing
      if ('type' in response && response.type === 'cancelled') {
        setIsLoading(false);
        onCancel?.();
        return;
      }

      const idToken = response.data?.idToken;

      if (!idToken) {
        setIsLoading(false);
        setError(i18n.t('googleAuth.noIdToken'));
        // Don't call onCancel — keep user on Google screen so they can see the error
        return;
      }

      const result = await googleLogin(idToken);

      if (result.success) {
        setIsLoading(false);
        if (result.isNewUser) {
          // New users: go to complete-profile immediately (no delay needed)
          router.push('/complete-profile?isGoogleUser=1');
        } else {
          // Returning users: flash success state briefly before navigating
          setIsSuccess(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          // Trigger the "Welcome back" banner on the Cards tab
          await AsyncStorage.setItem('showWelcome', '1');
          await new Promise((r) => setTimeout(r, 550));
          if (mountedRef.current) router.replace('/(tabs)/qr');
        }
      } else {
        setIsLoading(false);
        setError(result.error || i18n.t('googleAuth.error', { action: actionLabel }));
        // Don't call onCancel — let user see the error and retry
      }
    } catch (err) {
      setIsLoading(false);

      if (isErrorWithCode && statusCodes && isErrorWithCode(err)) {
        if (
          err.code === statusCodes.SIGN_IN_CANCELLED ||
          err.code === statusCodes.IN_PROGRESS
        ) {
          // User explicitly cancelled or another sign-in is in progress — go back
          onCancel?.();
          return;
        }

        // DEVELOPER_ERROR (code 10) = SHA-1 fingerprint mismatch between
        // signing key and Google Cloud Console, or wrong webClientId.
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError(i18n.t('googleAuth.playServicesUnavailable'));
          return;
        }
      }

      // Show user-friendly message; include native details only in development
      const nativeMsg = err instanceof Error ? err.message : String(err);
      const code = isErrorWithCode && isErrorWithCode(err) ? (err as any).code : '';
      const userMessage = i18n.t('googleAuth.launchError', { action: actionLabel });
      if (__DEV__) {
        const detail = code ? `[${code}] ${nativeMsg}` : nativeMsg;
        setError(`${userMessage}\n${detail}`);
      } else {
        setError(userMessage);
      }
      // Don't call onCancel — let user see the error and retry
    }
  }, [actionLabel, googleLogin, onCancel]);

  return { isLoading, isSuccess, error, setError, setIsLoading, promptGoogle };
}
