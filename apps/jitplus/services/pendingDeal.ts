import type { Href } from 'expo-router';
import { isEntityId } from '@/utils/ids';

/** A guest who opens a shared deal and signs up within this delay lands back on it. */
export const PENDING_DEAL_TTL_MS = 30 * 60 * 1000;

// Kept in memory only: it only has to survive the login screens, not an app restart.
let pending: { id: string; savedAt: number } | null = null;

export function savePendingDeal(id: string, now = Date.now()): void {
  if (isEntityId(id)) pending = { id, savedAt: now };
}

export function clearPendingDeal(): void {
  pending = null;
}

/** Returns the deal kept before login if it is still fresh, and forgets it either way. */
export function takePendingDeal(now = Date.now()): string | null {
  const entry = pending;
  pending = null;
  if (!entry || entry.savedAt > now || now - entry.savedAt > PENDING_DEAL_TTL_MS) return null;
  return entry.id;
}

interface PostLoginRouter {
  replace: (href: Href) => void;
  push: (href: Href) => void;
}

/**
 * Where every successful login ends: the QR tab, with the deal the guest was
 * looking at pushed on top so "back" still lands in the app.
 */
export function goHomeAfterLogin(router: PostLoginRouter): void {
  router.replace('/(tabs)/qr');
  const dealId = takePendingDeal();
  if (dealId) router.push({ pathname: '/deal/[id]', params: { id: dealId } });
}
