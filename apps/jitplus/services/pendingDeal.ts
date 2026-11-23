import type { Href } from 'expo-router';
import { isEntityId } from '@/utils/ids';

/** A visitor who opens a shared deal and signs up within this delay lands back on it. */
export const PENDING_DEAL_TTL_MS = 30 * 60 * 1000;

// Kept in memory only: it only has to survive the login screens, not an app restart.
let pending: { id: string; savedAt: number } | null = null;

// A merchant page left for the login, with "join" when the visitor tapped Join.
// Only the latest of the deal and the merchant page is kept: login reopens what
// the visitor was doing last.
let pendingMerchant: { merchantId: string; join: boolean; savedAt: number } | null = null;

// The Join the visitor tapped, handed to the merchant page in memory. It never
// travels in the URL: a route param can be forged by any external link
// (jitplus://… with an encoded "join" key slips past URL filters), which would
// enrol whoever opens it — security audit 2026-11-21.
let pendingAutoJoin: { merchantId: string; savedAt: number } | null = null;

export function savePendingDeal(id: string, now = Date.now()): void {
  if (!isEntityId(id)) return;
  pending = { id, savedAt: now };
  pendingMerchant = null;
}

/** Forgets the pending deal and merchant page (logout). */
export function clearPendingDeal(): void {
  pending = null;
  pendingMerchant = null;
  pendingAutoJoin = null;
}

/** Returns the deal kept before login if it is still fresh, and forgets it either way. */
export function takePendingDeal(now = Date.now()): string | null {
  const entry = pending;
  pending = null;
  if (!entry || entry.savedAt > now || now - entry.savedAt > PENDING_DEAL_TTL_MS) return null;
  return entry.id;
}

/** Reopens a merchant page after login; `join` also creates the card there. */
export function savePendingMerchant(merchantId: string, join: boolean, now = Date.now()): void {
  if (!isEntityId(merchantId)) return;
  pendingMerchant = { merchantId, join, savedAt: now };
  pending = null;
}

/** Returns the merchant left for the login if still fresh, and forgets it either way. */
function takePendingMerchant(now = Date.now()): { merchantId: string; join: boolean } | null {
  const entry = pendingMerchant;
  pendingMerchant = null;
  if (!entry || entry.savedAt > now || now - entry.savedAt > PENDING_DEAL_TTL_MS) return null;
  return { merchantId: entry.merchantId, join: entry.join };
}

/**
 * True once, on the page of the merchant the visitor tapped Join on before
 * logging in. Other merchant pages leave the intent in place.
 */
export function takePendingAutoJoin(merchantId: string, now = Date.now()): boolean {
  const entry = pendingAutoJoin;
  if (!entry || entry.merchantId !== merchantId) return false;
  pendingAutoJoin = null;
  return entry.savedAt <= now && now - entry.savedAt <= PENDING_DEAL_TTL_MS;
}

interface PostLoginRouter {
  replace: (href: Href) => void;
  push: (href: Href) => void;
  canDismiss?: () => boolean;
  dismissAll?: () => void;
}

/**
 * Where every successful login ends: the QR tab, with the shared deal or
 * merchant page the visitor was looking at pushed on top so "back" still lands
 * in the app.
 */
export function goHomeAfterLogin(router: PostLoginRouter): void {
  // Whole history: welcome / login / register / verify-otp must not stay under
  // the tabs, where Android Back brought them back to a signed-in user.
  if (router.canDismiss?.()) router.dismissAll?.();
  router.replace('/(tabs)/qr');
  const dealId = takePendingDeal();
  if (dealId) router.push({ pathname: '/deal/[id]', params: { id: dealId } });
  const merchant = takePendingMerchant();
  if (merchant) {
    pendingAutoJoin = merchant.join ? { merchantId: merchant.merchantId, savedAt: Date.now() } : null;
    router.push({ pathname: '/merchant/[id]', params: { id: merchant.merchantId } });
  }
}
