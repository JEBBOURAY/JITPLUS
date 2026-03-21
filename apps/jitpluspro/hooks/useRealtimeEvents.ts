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
import { queryKeys } from './useQueryHooks';

/**
 * Listen for real-time events on the socket and invalidate cache.
 * Call this once in your root layout.
 */
export function useRealtimeEvents(socket: Socket | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    // ── Transaction recorded (by any team member / device) ───
    const onTransactionRecorded = (payload: TransactionRecordedPayload) => {
      // Invalidate the affected client's detail & status
      queryClient.invalidateQueries({ queryKey: queryKeys.clientDetail(payload.clientId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clientStatus(payload.clientId) });
      // Invalidate transactions list
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      // Invalidate dashboard stats (transaction count, points, etc.)
      // Use prefix-based invalidation via partial queryKeys
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] as const });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trends'] as const });

      if (__DEV__) {
        console.log('[RT] Transaction recorded:', payload.type, payload.points, 'pts for client', payload.clientId);
      }
    };

    socket.on(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);

    return () => {
      socket.off(WS_EVENTS.TRANSACTION_RECORDED, onTransactionRecorded);
    };
  }, [socket, queryClient]);
}
