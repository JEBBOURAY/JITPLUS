import { useCallback, useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { isValidEmail } from '@/utils/validation';
import { hapticSuccess } from '@/utils/haptics';
import { resetTo } from '@/utils/navReset';
import { parseRetryAfterMs } from '@/components/login/retryAfter';

export type LoginErrorType = 'none' | 'credentials' | 'generic';
export interface LoginError { type: LoginErrorType; message: string }
const NO_ERROR: LoginError = { type: 'none', message: '' };

type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };
const isOnlineState = (state: NetState) => Boolean(state.isConnected) && state.isInternetReachable !== false;

/**
 * Email + password sign-in: fields, connectivity, 429 cool-down and error
 * mapping (wrong credentials vs network vs other). `otherAuthBusy` is true while
 * a Google or Apple sign-in runs, so only one sign-in happens at a time.
 */
export function useEmailLogin(otherAuthBusy: boolean) {
  const { signIn } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loginError, setLoginError] = useState<LoginError>(NO_ERROR);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  // Minutes, not seconds: the banner shows minutes, so the screen re-renders once a minute.
  const [rateRemainingMin, setRateRemainingMin] = useState(0);

  useEffect(() => {
    const applyOnline = (state: NetState) => setIsOnline(isOnlineState(state));
    NetInfo.fetch().then(applyOnline).catch(() => {});
    return NetInfo.addEventListener(applyOnline);
  }, []);

  // update() zeroes rateRemainingMin before clearing rateLimitedUntil, so no reset is needed here.
  // Ticks every second for an exact unlock, but same-value updates don't re-render.
  useEffect(() => {
    if (!rateLimitedUntil) return;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 60_000));
      setRateRemainingMin(remaining);
      if (remaining === 0) setRateLimitedUntil(null);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [rateLimitedUntil]);

  const clearCredentialError = useCallback(() => {
    setLoginError((e) => (e.type === 'credentials' ? NO_ERROR : e));
  }, []);

  const changeEmail = useCallback((v: string) => {
    setEmail(v);
    clearCredentialError();
  }, [clearCredentialError]);

  const changePassword = useCallback((v: string) => {
    setPassword(v);
    clearCredentialError();
  }, [clearCredentialError]);

  /** Prefill from another screen (register → "already have an account"). */
  const prefill = useCallback((address: string) => {
    setEmail(address);
    setPassword('');
  }, []);

  const isRateLimited = rateRemainingMin > 0;
  const canSubmit = isValidEmail(email) && password.length > 0;
  const authBusy = isLoading || otherAuthBusy;
  const submitDisabled = authBusy || !canSubmit || !isOnline || isRateLimited;

  const submit = useCallback(async () => {
    Keyboard.dismiss();
    if (submitDisabled) return;

    setLoginError(NO_ERROR);
    setIsLoading(true);
    try {
      // Keep session persistence enabled on mobile by default.
      await signIn({ email: email.trim().toLowerCase(), password }, true);
      hapticSuccess();
      resetTo('/(tabs)');
    } catch (err: unknown) {
      const axiosErr = err as {
        isAxiosError?: boolean;
        code?: string;
        response?: { status?: number; data?: Record<string, unknown> };
      };

      const status = axiosErr?.response?.status;
      const isNetworkError = axiosErr?.isAxiosError && (
        axiosErr?.code === 'ECONNABORTED' ||
        axiosErr?.code === 'ERR_NETWORK' ||
        !axiosErr?.response
      );

      if (status === 429) {
        const retryAfterMs = parseRetryAfterMs(err);
        if (retryAfterMs) {
          setRateLimitedUntil(Date.now() + retryAfterMs);
          setLoginError(NO_ERROR);
        } else {
          setLoginError({ type: 'generic', message: getErrorMessage(err, t('common.genericError')) });
        }
      } else if (status === 401 || status === 400) {
        setLoginError({ type: 'credentials', message: t('login.invalidCredentialsGeneric') });
      } else if (isNetworkError) {
        setIsOnline(isOnlineState(await NetInfo.fetch()));
        setLoginError({ type: 'generic', message: t('common.networkErrorMsg') });
      } else {
        setLoginError({ type: 'generic', message: getErrorMessage(err, t('login.invalidCredentials')) });
      }
    } finally {
      setIsLoading(false);
    }
  }, [submitDisabled, email, password, signIn, t]);

  return {
    email,
    password,
    changeEmail,
    changePassword,
    prefill,
    isLoading,
    isOnline,
    loginError,
    isRateLimited,
    rateRemainingMin,
    authBusy,
    submitDisabled,
    submit,
  };
}

export type EmailLogin = ReturnType<typeof useEmailLogin>;
