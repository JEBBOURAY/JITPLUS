/**
 * React Query hooks for scratch cards and coupons (client app).
 * Real-time invalidation is wired in useRealtimeEvents (SCRATCH_CARDS_CHANGED,
 * COUPON_UPDATED) and via FCM data payloads.
 */
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { ClientCouponStatus, ScratchCardListStatus, ScratchResult } from '@/services/api/scratch';
export type { ClientCouponStatus, ScratchCardListStatus, ScratchResult } from '@/services/api/scratch';
import type { CouponDto, ScratchCardDto } from '@jitplus/shared/src/scratch';

export const scratchKeys = {
  cards: ['scratch', 'cards'] as const,
  cardDetails: ['scratch', 'card'] as const,
  card: (id: string) => ['scratch', 'card', id] as const,
  cardsByCampaign: ['scratch', 'card-by-campaign'] as const,
  cardByCampaign: (campaignId: string) => ['scratch', 'card-by-campaign', campaignId] as const,
  coupons: ['scratch', 'coupons'] as const,
  couponsByStatus: (status: ClientCouponStatus) => ['scratch', 'coupons', status] as const,
  coupon: (id: string) => ['scratch', 'coupon', id] as const,
} as const;

/** Lists and single-card queries (by id and by campaign) share no common prefix besides 'scratch'. */
export function invalidateScratchCards(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: scratchKeys.cards });
  qc.invalidateQueries({ queryKey: scratchKeys.cardDetails });
  qc.invalidateQueries({ queryKey: scratchKeys.cardsByCampaign });
}

export function useScratchCards(status: ScratchCardListStatus | undefined, enabled = true) {
  return useQuery<ScratchCardDto[]>({
    queryKey: status ? [...scratchKeys.cards, status] : scratchKeys.cards,
    queryFn: () => api.getScratchCards(status),
    staleTime: 30 * 1000,
    enabled,
  });
}

/** Pending (unscratched) cards — used by the home banner and the scratch screen. */
export function usePendingScratchCards(enabled = true) {
  return useScratchCards('PENDING', enabled);
}

export function useScratchCard(cardId: string | undefined, enabled = true) {
  return useQuery<ScratchCardDto>({
    queryKey: scratchKeys.card(cardId ?? ''),
    queryFn: () => api.getScratchCard(cardId!),
    enabled: enabled && !!cardId,
    staleTime: 10 * 1000,
  });
}

export function useScratchCardByCampaign(campaignId: string | undefined, enabled = true) {
  return useQuery<ScratchCardDto>({
    queryKey: scratchKeys.cardByCampaign(campaignId ?? ''),
    queryFn: () => api.getScratchCardByCampaign(campaignId!),
    enabled: enabled && !!campaignId,
    staleTime: 10 * 1000,
    retry: false,
  });
}

export function useMarkScratchCardOpened() {
  return useMutation({
    mutationFn: (cardId: string) => api.markScratchCardOpened(cardId),
  });
}

/**
 * The draw itself. On success the card + coupon are written straight into the
 * cache so the reveal animation never waits on a refetch.
 */
export function useScratchCardDraw() {
  const qc = useQueryClient();
  return useMutation<ScratchResult, unknown, string>({
    mutationFn: (cardId) => api.scratchCard(cardId),
    onSuccess: (result, cardId) => {
      qc.setQueryData(scratchKeys.card(cardId), result.card);
      qc.setQueryData(scratchKeys.coupon(result.coupon.id), result.coupon);
      qc.invalidateQueries({ queryKey: scratchKeys.cards });
      qc.invalidateQueries({ queryKey: scratchKeys.coupons });
    },
  });
}

export function useClientCoupons(status: ClientCouponStatus | undefined, enabled = true) {
  return useQuery<CouponDto[]>({
    queryKey: status ? scratchKeys.couponsByStatus(status) : scratchKeys.coupons,
    queryFn: () => api.getClientCoupons(status),
    staleTime: 30 * 1000,
    enabled,
  });
}

/** Active coupon count for badges/banners (kept cheap: the list is capped at 100). */
export function useActiveCoupons(enabled = true) {
  return useClientCoupons('active', enabled);
}

export function useClientCoupon(couponId: string | undefined, enabled = true) {
  return useQuery<CouponDto>({
    queryKey: scratchKeys.coupon(couponId ?? ''),
    queryFn: () => api.getClientCoupon(couponId!),
    enabled: enabled && !!couponId,
    staleTime: 15 * 1000,
  });
}
