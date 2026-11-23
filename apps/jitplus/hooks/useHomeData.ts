import { useEffect, useMemo } from 'react';
import { useStampsOverview, useNotifications, useLuckyWheelAvailableDraws } from '@/hooks/useQueryHooks';
import { prefetchImages } from '@/utils/imageCache';
import type { LoyaltyCard, LuckyWheelTicket } from '@/types';

const NO_CARDS: LoyaltyCard[] = [];
const NO_TICKETS: LuckyWheelTicket[] = [];

export function useHomeData(enabled: boolean) {
  // ── React Query ──
  const {
    data: stampsData,
    isLoading,
    isError: loadError,
    refetch,
    isRefetching,
  } = useStampsOverview(enabled);

  const { data: luckyWheelTickets = NO_TICKETS, refetch: refetchWheelTickets } = useLuckyWheelAvailableDraws(enabled);
  const { data: notifData } = useNotifications(enabled);

  const rawCards = stampsData?.cards ?? NO_CARDS;

  // Prefetch merchant logos
  useEffect(() => {
    if (rawCards.length) prefetchImages(rawCards.map((c) => c.merchant?.logoUrl));
  }, [rawCards]);

  // ── Most recently used first ──
  const cards = useMemo(() => [...rawCards].sort((a, b) =>
    new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()),
  [rawCards]);

  return {
    isLoading,
    loadError,
    isRefetching,
    luckyWheelTickets,
    notifData,
    cards,

    refetch,
    refetchWheelTickets,
  };
}
