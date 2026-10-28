import { api } from '@/services/api';

const DEFAULT_TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 2;

/**
 * Tells the server the device is signing out (push token cleared, refresh
 * token revoked), waiting at most `timeoutMs`. These calls need the session
 * token, so they must run before the local wipe; the bound keeps a dead or
 * slow network from leaving the user signed in on this device. Once the bound
 * is hit no further attempt starts, since the token is about to be erased.
 */
export async function notifyServerLogout(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  let abandoned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    await api.updatePushToken('').catch((e) => { if (__DEV__) console.warn('Failed to clear push token on logout', e); });
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !abandoned; attempt++) {
      try {
        await api.logout();
        return;
      } catch {
        if (attempt < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  };

  const deadline = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  try {
    await Promise.race([run(), deadline]);
  } finally {
    abandoned = true;
    clearTimeout(timer);
  }
}
