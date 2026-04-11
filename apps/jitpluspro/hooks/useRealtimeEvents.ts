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
} from '@jitplus/shared/src/realtime';
import { logInfo, logWarn } from '@/utils/devLogger';
import { queryKeys } from './useQueryHooks';
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
    // (e.g. 10 scans in 5 seconds) into a single refetch.
    let txDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedInvalidateTx = () => {
      if (txDebounceTimer) clearTimeout(txDebounceTimer);
      txDebounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'], refetchType: 'none' });
        queryClient.invalidateQueries({ queryKey: ['dashboard-trends'], refetchType: 'none' });
      }, 2_000);
    };

    // ── Transaction recorded (by any team member / device) ───
    const onTransactionRecorded = (payload: TransactionRecordedPayload) => {
      // SECURITY: Verify the event belongs to the current merchant
      const currentMerchant = useAuthStore.getState().merchant;
      if (currentMerchant && payload.merchantId !== currentMerchant.id) {
        logWarn('RT', 'Ignoring event for different merchant:', payload.merchantId);
        return;
      }
      // Targeted invalidation: only the affected client's detail & status
      queryClient.invalidateQueries({ queryKey: queryKeys.clientDetail(payload.clientId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clientStatus(payload.clientId) });
      // Debounce: batch transactions + dashboard invalidation (2s window)
      debouncedInvalidateTx();

      if (__DEV__) {
        logInfo('RT', 'Transaction recorded:', payload.type, payload.points, 'pts for client', payload.clientId);
      }
    };

    socket.on(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);

    return () => {
      if (txDebounceTimer) clearTimeout(txDebounceTimer);
      socket.off(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);
    };
  }, [socket, queryClient]);
}
