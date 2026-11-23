/**
 * Native Google / Apple prompts shared by the login hooks (which then call the
 * backend) and the registration hooks (which only keep the token for the form).
 * Both SDKs are lazy-loaded so Expo Go, Android (Apple) and web don't crash.
 */
import { Platform } from 'react-native';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@/utils/googleSignin';
import { WEB_CLIENT_ID } from '@/config/google';
import { randomUUID, sha256Hex } from '@/utils/crypto';

type Translate = (key: string) => string;

/** `error` is undefined when the user cancelled: nothing to show. */
export type SignInOutcome<T> = { ok: true; value: T } | { ok: false; error?: string };

export async function requestGoogleIdToken(t: Translate): Promise<SignInOutcome<string>> {
  if (!GoogleSignin || !isErrorWithCode || !statusCodes || !WEB_CLIENT_ID) {
    return { ok: false, error: t('googleAuth.notConfigured') };
  }
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    // V16 API: cancellation returns { type: 'cancelled' }
    if ('type' in response && response.type === 'cancelled') return { ok: false };
    const idToken = response.data?.idToken;
    return idToken ? { ok: true, value: idToken } : { ok: false, error: t('googleAuth.noIdToken') };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) return { ok: false };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { ok: false, error: t('googleAuth.playServicesUnavailable') };
      }
    }
    const message = t('googleAuth.launchError');
    if (!__DEV__) return { ok: false, error: message };
    const nativeMsg = err instanceof Error ? err.message : String(err);
    const code = isErrorWithCode(err) ? err.code : '';
    return { ok: false, error: `${message}\n${code ? `[${code}] ${nativeMsg}` : nativeMsg}` };
  }
}

let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AppleAuthentication = require('expo-apple-authentication');
  } catch {
    // Not available
  }
}

/** True when Apple Sign-In is available on this device. */
export const isAppleSignInAvailable = Platform.OS === 'ios' && !!AppleAuthentication;

export interface AppleTokenData {
  identityToken: string;
  givenName?: string;
  familyName?: string;
  /** Raw nonce whose SHA-256 was sent to Apple; the backend checks the JWT `nonce` claim against it. */
  rawNonce: string;
}

/**
 * Apple sends the name only on the very first authorization of an Apple ID.
 * When that first attempt is a login without an account, the merchant then
 * signs in again from the register screen and Apple returns no name: keep it
 * for the session, keyed by the Apple user id.
 */
const appleNameCache = new Map<string, { givenName?: string; familyName?: string }>();

export async function requestAppleCredential(t: Translate): Promise<SignInOutcome<AppleTokenData>> {
  if (!AppleAuthentication || Platform.OS !== 'ios') return { ok: false, error: t('appleAuth.notAvailable') };
  try {
    // Replay protection (Apple recommendation): send sha256(rawNonce), forward rawNonce to the backend.
    const rawNonce = randomUUID() + randomUUID().replace(/-/g, '');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: await sha256Hex(rawNonce),
    });
    if (!credential.identityToken) return { ok: false, error: t('appleAuth.noToken') };
    let givenName = credential.fullName?.givenName ?? undefined;
    let familyName = credential.fullName?.familyName ?? undefined;
    if (credential.user) {
      if (givenName || familyName) {
        appleNameCache.set(credential.user, { givenName, familyName });
      } else {
        const cached = appleNameCache.get(credential.user);
        givenName = cached?.givenName;
        familyName = cached?.familyName;
      }
    }
    return {
      ok: true,
      value: { identityToken: credential.identityToken, givenName, familyName, rawNonce },
    };
  } catch (e: unknown) {
    if ((e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return { ok: false };
    return { ok: false, error: t('appleAuth.error') };
  }
}
