import { useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';

/**
 * What the register form keeps when the merchant leaves the app halfway.
 * Never the password, nor Google / Apple tokens. Stored in SecureStore since
 * it holds an e-mail and a phone number.
 */
export interface RegisterDraft {
  email?: string;
  nomCommerce?: string;
  phoneNumber?: string;
  categorie?: string;
  ville?: string;
  quartier?: string;
  adresse?: string;
  latitude?: number | null;
  longitude?: number | null;
  referralCode?: string;
}

const KEY = 'jitpluspro_register_draft_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 600;

function isEmpty(d: RegisterDraft): boolean {
  return Object.values(d).every((v) => v == null || v === '');
}

/**
 * Restores the last draft once on mount (through `onRestore`), then saves the
 * form as it changes. Call `clear` once the account exists.
 */
export function useRegisterDraft(draft: RegisterDraft, onRestore: (d: RegisterDraft) => void) {
  const readyRef = useRef(false);
  const clearedRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  // Kept current outside render; the restore runs after the storage read, so later.
  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as { savedAt?: number; draft?: RegisterDraft };
        if (!saved.draft || !saved.savedAt || Date.now() - saved.savedAt > MAX_AGE_MS) {
          void SecureStore.deleteItemAsync(KEY).catch(() => {});
          return;
        }
        onRestoreRef.current(saved.draft);
      })
      .catch(() => {
        // Unreadable draft: start from an empty form.
      })
      .finally(() => {
        if (!cancelled) readyRef.current = true;
      });
    return () => { cancelled = true; };
  }, []);

  const serialized = JSON.stringify(draft);
  useEffect(() => {
    // Saving before the restore has run would overwrite the draft with an empty form.
    if (!readyRef.current || clearedRef.current) return;
    const timer = setTimeout(() => {
      const current = JSON.parse(serialized) as RegisterDraft;
      const op = isEmpty(current)
        ? SecureStore.deleteItemAsync(KEY)
        : SecureStore.setItemAsync(KEY, JSON.stringify({ savedAt: Date.now(), draft: current }));
      op.catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [serialized]);

  const clear = useCallback(() => {
    clearedRef.current = true;
    void SecureStore.deleteItemAsync(KEY).catch(() => {});
  }, []);

  return { clear };
}
