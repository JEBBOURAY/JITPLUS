import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';

interface PromptLoginOptions {
  /** Saves what the guest wanted, so the page comes back once signed in. */
  remember?: () => void;
  title?: string;
  message?: string;
}

/** Sign-up / sign-in alert shown when a guest taps an action that needs an account. */
export function usePromptLogin() {
  const router = useRouter();
  const { t } = useLanguage();
  return useCallback(({ remember, title, message }: PromptLoginOptions = {}) => {
    Alert.alert(
      title ?? t('guest.loginRequired'),
      message ?? t('guest.loginRequiredDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('welcome.createAccount'), onPress: () => { remember?.(); router.push('/register'); } },
        { text: t('welcome.login'), onPress: () => { remember?.(); router.push('/login'); } },
      ],
      { cancelable: true },
    );
  }, [router, t]);
}
