/**
 * Card and moderation actions of the merchant page. Each one has its own
 * pending state, so a slow report never blocks Leave.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { MerchantReportReason } from '@/services/api/merchants';
import { invalidateStamps, queryKeys } from '@/hooks/useQueryHooks';
import { invalidateDealLists } from '@/hooks/useDealHooks';
import { invalidateCollections } from '@/hooks/useCollectionHooks';
import { bookingKeys } from '@/hooks/useBookingHooks';
import type { Merchant } from '@/types';

function patchMerchant(qc: QueryClient, merchantId: string, patch: Partial<Merchant>) {
  qc.setQueriesData<Merchant>({ queryKey: queryKeys.merchant(merchantId) }, (m) => (m ? { ...m, ...patch } : m));
}

/**
 * Joining or leaving moves the wallet (and its tickets), the collections and
 * the booking search ("own shops first").
 */
function refreshCards(qc: QueryClient, merchantId: string) {
  invalidateStamps(qc);
  qc.invalidateQueries({ queryKey: queryKeys.merchant(merchantId) });
  invalidateCollections(qc, merchantId);
  qc.invalidateQueries({ queryKey: bookingKeys.searches });
}

export function useJoinMerchant(merchantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.joinMerchant(merchantId),
    onSuccess: (res) => {
      const welcomeBonus = res.card?.welcomeBonus ?? null;
      const granted = res.card?.welcomeBonusGranted ?? 0;
      patchMerchant(qc, merchantId, {
        hasCard: true,
        cardDeactivated: false,
        cardBalance: res.card?.stamps ?? 0,
        cardWelcomeBonus: welcomeBonus,
        // Credited or reserved: the offer is now on the card.
        ...(welcomeBonus || granted > 0 ? { welcomeOffer: null } : {}),
      });
      refreshCards(qc, merchantId);
    },
  });
}

export function useLeaveMerchant(merchantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.leaveMerchant(merchantId),
    onSuccess: () => {
      patchMerchant(qc, merchantId, { hasCard: false, cardDeactivated: true, cardBalance: 0, cardStampsExpireAt: null, cardWelcomeBonus: null });
      refreshCards(qc, merchantId);
    },
  });
}

/** Apple 1.2: the server then leaves this merchant out of the lists, deal feeds and booking search. */
export function useBlockMerchant(merchantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.blockMerchant(merchantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.merchants });
      qc.invalidateQueries({ queryKey: queryKeys.merchant(merchantId) });
      invalidateStamps(qc);
      invalidateCollections(qc, merchantId);
      invalidateDealLists(qc);
      qc.invalidateQueries({ queryKey: bookingKeys.searches });
    },
  });
}

export function useReportMerchant(merchantId: string) {
  return useMutation({
    mutationFn: (reason: MerchantReportReason) => api.reportMerchant(merchantId, reason),
  });
}
