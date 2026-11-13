import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';

export interface MessageDraft {
  title: string;
  body: string;
}

const EMPTY: MessageDraft = { title: '', body: '' };
const SAVE_DELAY_MS = 500;
const hasText = (d: MessageDraft) => d.title.length > 0 || d.body.length > 0;

/**
 * The notification being written. Kept on the device per account, so closing
 * the app does not lose it; `reset` forgets it once sent or cleared.
 */
export function useMessageDraft(accountId: string | undefined) {
  const storageKey = `${ASYNC_STORAGE_KEYS.MESSAGES_DRAFT}_${accountId ?? 'anon'}`;
  const [draft, setDraft] = useState(EMPTY);
  // Saving before the stored draft is read would overwrite it with an empty one.
  const [restoredKey, setRestoredKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active || !raw) return;
        const saved = JSON.parse(raw) as Partial<MessageDraft>;
        if (typeof saved.title !== 'string' || typeof saved.body !== 'string') return;
        const restored = { title: saved.title, body: saved.body };
        // Text typed before the read finished wins over the stored draft.
        setDraft((current) => (hasText(current) ? current : restored));
      })
      .catch(() => {
        // Unreadable draft: start from an empty message.
      })
      .finally(() => {
        if (active) setRestoredKey(storageKey);
      });
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (restoredKey !== storageKey) return;
    const timer = setTimeout(() => {
      const op = hasText(draft)
        ? AsyncStorage.setItem(storageKey, JSON.stringify(draft))
        : AsyncStorage.removeItem(storageKey);
      op.catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, restoredKey, storageKey]);

  const update = useCallback((patch: Partial<MessageDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);
  const reset = useCallback(() => setDraft(EMPTY), []);

  return { ...draft, update, reset };
}
