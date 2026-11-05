import * as SecureStore from 'expo-secure-store';
import { isClaimToken, isStampCodeToken } from '@/utils/ids';

export const PENDING_CLAIM_KEY = 'pendingClaimToken';
export const PENDING_STAMP_CODE_KEY = 'pendingStampCodeToken';

/**
 * Long enough to create an account from the link, short enough that someone
 * logging in later on a shared phone doesn't inherit another person's link.
 */
export const PENDING_CLAIM_TTL_MS = 60 * 60 * 1000;

/**
 * A link token opened while logged out (Quick-Add claim link, e-commerce
 * parcel QR code), kept in SecureStore to be resumed after login.
 */
function pendingToken(key: string, isValid: (value: unknown) => value is string) {
  return {
    async save(token: string, now = Date.now()): Promise<void> {
      try {
        await SecureStore.setItemAsync(key, JSON.stringify({ token, savedAt: now }));
      } catch { /* non-fatal: the user can reopen the link */ }
    },

    async clear(): Promise<void> {
      try { await SecureStore.deleteItemAsync(key); } catch { /* non-fatal */ }
    },

    /**
     * Returns the pending token if it is still fresh, and always removes it so a
     * failed or declined link isn't replayed on every login.
     */
    async take(now = Date.now()): Promise<string | null> {
      let raw: string | null = null;
      try { raw = await SecureStore.getItemAsync(key); } catch { return null; }
      if (!raw) return null;
      await this.clear();
      try {
        const { token, savedAt } = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
        if (!isValid(token) || typeof savedAt !== 'number') return null;
        if (savedAt > now || now - savedAt > PENDING_CLAIM_TTL_MS) return null;
        return token;
      } catch {
        // Older versions stored the bare token without a timestamp: its age is unknown.
        return null;
      }
    },
  };
}

const claim = pendingToken(PENDING_CLAIM_KEY, isClaimToken);
const stampCode = pendingToken(PENDING_STAMP_CODE_KEY, isStampCodeToken);

/** Keeps a claim token opened while logged out, to resume it after login. */
export const savePendingClaim = (token: string, now?: number) => claim.save(token, now);
export const clearPendingClaim = () => claim.clear();
export const takePendingClaim = (now?: number) => claim.take(now);

/** Same for a parcel QR code scanned while logged out. */
export const savePendingStampCode = (token: string, now?: number) => stampCode.save(token, now);
export const clearPendingStampCode = () => stampCode.clear();
export const takePendingStampCode = (now?: number) => stampCode.take(now);
