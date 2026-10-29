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
import { logInfo, logWarn } from '@/utils/devLogger';
import { queryKeys, isLocalTransactionEcho } from './useQueryHooks';
import { scratchKeys } from './useScratchHooks';
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
    let txListStale = false;
    const debouncedInvalidateTx = (refreshList: boolean) => {
      txListStale = txListStale || refreshList;
      if (txDebounceTimer) clearTimeout(txDebounceTimer);
      txDebounceTimer = setTimeout(() => {
        if (txListStale) queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
        txListStale = false;
        queryClient.invalidateQueries({ queryKey: queryKeys.homeStats });
        queryClient.invalidateQueries({ queryKey: ['dashboard-trends'], refetchType: 'none' });
      }, 500);
    };

    const onTransactionRecorded = (payload: TransactionRecordedPayload) => {
      const currentMerchant = useAuthStore.getState().merchant;
      if (currentMerchant && payload.merchantId !== currentMerchant.id) {
        logWarn('RT', 'Ignoring event for different merchant:', payload.merchantId);
        return;
      }
      // useRecordTransaction already refreshed the client and the list for this device's own transactions.
      const isEcho = isLocalTransactionEcho(payload.clientId);
      if (!isEcho) {
        queryClient.invalidateQueries({ queryKey: queryKeys.clientDetail(payload.clientId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.clientStatus(payload.clientId) });
      }
      debouncedInvalidateTx(!isEcho);

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

    socket.on(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);
    socket.on(WS_EVENTS.COUPON_REDEEMED, onCouponRedeemed);

    return () => {
      if (txDebounceTimer) clearTimeout(txDebounceTimer);
      socket.off(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);
      socket.off(WS_EVENTS.COUPON_REDEEMED, onCouponRedeemed);
    };
  }, [socket, queryClient]);
}
