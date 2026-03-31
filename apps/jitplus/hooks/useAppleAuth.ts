/**
 * Apple Sign-In hook for JitPlus (client app).
 * Uses expo-apple-authentication — only available on iOS 13+.
 * On Android/Expo Go, the hook degrades gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { haptic } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';
import i18n from '@/i18n';

interface UseAppleAuthOptions {
  onCancel?: () => void;
}

export function useAppleAuth({ onCancel }: UseAppleAuthOptions = {}) {
  const { appleLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  /** True if Apple Sign-In is available (iOS 13+) */
  const isAvailable = Platform.OS === 'ios';

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const promptApple = useCallback(async () => {
    setError('');
    setIsSuccess(false);
    setIsLoading(true);

    if (Platform.OS !== 'ios') {
      setIsLoading(false);
      setError(i18n.t('appleAuth.notAvailable'));
      return;
    }

    try {
      const AppleAuthentication = await import('expo-apple-authentication');

      const isAvail = await AppleAuthentication.isAvailableAsync();
      if (!isAvail) {
        setIsLoading(false);
        setError(i18n.t('appleAuth.notAvailable'));
        return;
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const identityToken = credential.identityToken;
      if (!identityToken) {
        setIsLoading(false);
        setError(i18n.t('appleAuth.noToken'));
        return;
      }

      const givenName = credential.fullName?.givenName ?? undefined;
      const familyName = credential.fullName?.familyName ?? undefined;

      const result = await appleLogin(identityToken, givenName, familyName);

      if (result.success) {
        setIsLoading(false);
        if (result.isNewUser) {
          router.push('/complete-profile');
        } else {
          setIsSuccess(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          await AsyncStorage.setItem('showWelcome', '1');
          await new Promise((r) => setTimeout(r, 550));
          if (mountedRef.current) router.replace('/(tabs)/qr');
        }
      } else {
        setIsLoading(false);
        setError(result.error || i18n.t('appleAuth.error'));
      }
    } catch (err: any) {
      setIsLoading(false);

      // User cancelled the Apple prompt
      if (err.code === 'ERR_REQUEST_CANCELED' || err.code === 'ERR_CANCELED') {
        onCancel?.();
        return;
      }

      if (__DEV__) {
        setError(`${i18n.t('appleAuth.error')}\n${err.message || err}`);
      } else {
        setError(i18n.t('appleAuth.error'));
      }
    }
  }, [appleLogin, onCancel]);

  return { isLoading, isSuccess, isAvailable, error, setError, setIsLoading, promptApple };
}
