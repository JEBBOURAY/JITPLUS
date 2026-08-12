import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import type { Merchant } from '@/types';

/**
 * Single source of truth for the "can this merchant scan?" hard dependency.
 *
 * A merchant can only scan a client QR / award loyalty once a loyalty program
 * (points or stamps) has been chosen. Until `merchant.loyaltyType` is set,
 * `POST /merchant/verify-qr` cannot resolve on the backend — this is a real
 * functional block, not a deferrable UX preference.
 */
export function canScan(merchant: Merchant | null | undefined): boolean {
  return !!merchant?.loyaltyType;
}

/** Deep-link params that make the loyalty settings screen show the scan prompt. */
export const LOYALTY_SETUP_PARAMS = { loyaltySetup: '1' } as const;

/**
 * Component-facing guard. Exposes whether scanning is allowed and a single
 * `openScanner()` action that either opens the scanner or redirects to the
 * loyalty configuration screen (with a warning banner) when it is not.
 *
 * Centralising the check here avoids duplicating the `loyaltyType` rule across
 * the many scan entry points (tab bar, Accueil, checklist, profile…).
 */
export function useScanGuard() {
  const router = useRouter();
  const merchant = useAuthStore((s) => s.merchant);
  const allowed = canScan(merchant);

  const openScanner = useCallback(() => {
    // Re-read the freshest merchant to avoid acting on a stale closure.
    if (canScan(useAuthStore.getState().merchant)) {
      router.push('/scan-qr');
    } else {
      router.push({ pathname: '/settings', params: LOYALTY_SETUP_PARAMS });
    }
  }, [router]);

  return { canScan: allowed, openScanner };
}
