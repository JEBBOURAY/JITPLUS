import type { LoyaltyCard } from '@/types';
import type { StampsEvent } from '@/stores/wsStore';

/** The same scan can arrive by WebSocket, push and polling: show it once. */
const SCAN_DEDUPE_MS = 30_000;

/**
 * Polling is only the fallback scan signal (the WebSocket event can be missed),
 * and a QR is almost always scanned in its first minute on screen: poll fast
 * first, then back off.
 */
const POLL_FAST_MS = 4_000;
const POLL_MEDIUM_MS = 10_000;
const POLL_SLOW_MS = 30_000;
const FAST_PHASE_MS = 60_000;
const MEDIUM_PHASE_MS = 180_000;

export function getScanPollInterval(activeForMs: number, wsConnected: boolean): number {
  if (activeForMs < FAST_PHASE_MS) return wsConnected ? POLL_MEDIUM_MS : POLL_FAST_MS;
  if (activeForMs < MEDIUM_PHASE_MS) return POLL_MEDIUM_MS;
  return POLL_SLOW_MS;
}

export function toBalanceMap(cards: LoyaltyCard[]): Map<string, number> {
  return new Map(cards.map((c) => [c.merchantId, c.balance ?? 0]));
}

/** Seconds until a v2 token should be refreshed (~10s before expiry, never < 5s). */
export function getRefreshDelayS(expiresAt: number, nowMs = Date.now()): number {
  const nowS = Math.floor(nowMs / 1000);
  return Math.max(5, expiresAt - nowS - 10);
}

/** Turns the first balance that moved since `previous` into a scan event. */
export function detectBalanceScan(
  previous: Map<string, number>,
  cards: LoyaltyCard[],
  now = Date.now(),
): StampsEvent | null {
  const changed = cards.find((c) => (c.balance ?? 0) !== (previous.get(c.merchantId) ?? 0));
  if (!changed) return null;
  const before = previous.get(changed.merchantId) ?? 0;
  const after = changed.balance ?? 0;
  return {
    clientId: changed.clientId,
    merchantId: changed.merchantId,
    merchantName: changed.merchant?.nomBoutique ?? '',
    stamps: Math.abs(after - before),
    newBalance: after,
    type: after > before ? 'EARN_STAMPS' : 'REDEEM_REWARD',
    receivedAt: now,
  };
}

export function scanEventKey(ev: Pick<StampsEvent, 'merchantId' | 'type' | 'newBalance'>): string {
  return `${ev.merchantId}:${ev.type}:${ev.newBalance}`;
}

/** Returns a checker that is true the first time a key is seen within the window. */
export function createScanDeduper(windowMs = SCAN_DEDUPE_MS) {
  const seen = new Map<string, number>();
  return (key: string, now = Date.now()): boolean => {
    for (const [k, at] of seen) if (now - at >= windowMs) seen.delete(k);
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  };
}
