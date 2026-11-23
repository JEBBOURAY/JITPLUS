/**
 * Real-time event listener for the merchant app.
 * Connects to the WebSocket server and auto-invalidates React Query cache
 * when the backend emits events (e.g. another team member records a transaction).
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import {
  WS_EVENTS,
  TransactionRecordedPayload,
  CouponRedeemedPayload,
} from '@jitplus/shared/src/realtime';
import { BOOKING_WS_EVENTS, type BookingChangedPayload } from '@jitplus/shared/src/booking';
import { logInfo, logWarn } from '@/utils/devLogger';
import { queryKeys, isLocalTransactionEcho } from './useQueryHooks';
import { scratchKeys } from './useScratchHooks';
import { markDashboardStale } from './queries/transactionCache';
import { useAuthStore } from '@/stores/authStore';

/**
 * Listen for real-time events on the socket and invalidate cache.
 * Call this once in your root layout.
 */
export function useRealtimeEvents(socket: Socket | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    // Debounce transactions list invalidation — batch rapid-fire RT events
    // (e.g. 10 scans in 5 seconds) into a single refetch. 500ms is short
    // enough that the merchant sees activity feel "live" while still
    // collapsing bursts.
    let txDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedInvalidateTx = () => {
      if (txDebounceTimer) clearTimeout(txDebounceTimer);
      txDebounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
        queryClient.invalidateQueries({ queryKey: queryKeys.homeStats });
        markDashboardStale(queryClient);
      }, 500);
    };

    const onTransactionRecorded = (payload: TransactionRecordedPayload) => {
      const currentMerchant = useAuthStore.getState().merchant;
      if (currentMerchant && payload.merchantId !== currentMerchant.id) {
        logWarn('RT', 'Ignoring event for different merchant:', payload.merchantId);
        return;
      }
      // This device's own transaction: its mutation already refreshed everything
      // (invalidateAfterTransaction in hooks/queries/transactionCache.ts).
      if (isLocalTransactionEcho(payload.clientId)) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.clientDetail(payload.clientId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clientStatus(payload.clientId) });
      debouncedInvalidateTx();

      if (__DEV__) {
        logInfo('RT', 'Transaction recorded:', payload.type, payload.stamps, 'stamps for client', payload.clientId);
      }
    };

    const onCouponRedeemed = (payload: CouponRedeemedPayload) => {
      const currentMerchant = useAuthStore.getState().merchant;
      if (currentMerchant && payload.merchantId !== currentMerchant.id) return;
      queryClient.invalidateQueries({ queryKey: scratchKeys.couponsAll });
      queryClient.invalidateQueries({ queryKey: scratchKeys.campaigns });
      queryClient.invalidateQueries({ queryKey: scratchKeys.statsAll });
    };

    // A booking was created or changed status (client app, another device, a scan check-in).
    const onBookingChanged = (payload: BookingChangedPayload) => {
      const currentMerchant = useAuthStore.getState().merchant;
      if (currentMerchant && payload.merchantId !== currentMerchant.id) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingAgendaRoot });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingPending });
      queryClient.invalidateQueries({ queryKey: queryKeys.booking(payload.bookingId) });
    };

    socket.on(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);
    socket.on(WS_EVENTS.COUPON_REDEEMED, onCouponRedeemed);
    socket.on(BOOKING_WS_EVENTS.CHANGED, onBookingChanged);

    return () => {
      if (txDebounceTimer) clearTimeout(txDebounceTimer);
      socket.off(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);
      socket.off(WS_EVENTS.COUPON_REDEEMED, onCouponRedeemed);
      socket.off(BOOKING_WS_EVENTS.CHANGED, onBookingChanged);
    };
  }, [socket, queryClient]);
}
