import * as SecureStore from 'expo-secure-store';
import { isClaimToken } from '@/utils/ids';

export const PENDING_CLAIM_KEY = 'pendingClaimToken';

/**
 * Long enough to create an account from the link, short enough that someone
 * logging in later on a shared phone doesn't inherit another person's link.
 */
export const PENDING_CLAIM_TTL_MS = 60 * 60 * 1000;

/** Keeps a claim token opened while logged out, to resume it after login. */
export async function savePendingClaim(token: string, now = Date.now()): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_CLAIM_KEY, JSON.stringify({ token, savedAt: now }));
  } catch { /* non-fatal: the user can reopen the link */ }
}

export async function clearPendingClaim(): Promise<void> {
  try { await SecureStore.deleteItemAsync(PENDING_CLAIM_KEY); } catch { /* non-fatal */ }
}

/**
 * Returns the pending token if it is still fresh, and always removes it so a
 * failed or declined claim isn't replayed on every login.
 */
export async function takePendingClaim(now = Date.now()): Promise<string | null> {
  let raw: string | null = null;
  try { raw = await SecureStore.getItemAsync(PENDING_CLAIM_KEY); } catch { return null; }
  if (!raw) return null;
  await clearPendingClaim();
  try {
    const { token, savedAt } = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
    if (!isClaimToken(token) || typeof savedAt !== 'number') return null;
    if (savedAt > now || now - savedAt > PENDING_CLAIM_TTL_MS) return null;
    return token;
  } catch {
    // Older versions stored the bare token without a timestamp: its age is unknown.
    return null;
  }
}
