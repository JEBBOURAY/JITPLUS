import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

// The socket echoes this device's own transactions back; the mutation already
// refreshed the client, the history and the home stats, so the echo must not
// refetch them again. Keyed by client because the echo can arrive before the
// HTTP response.
const LOCAL_TX_ECHO_WINDOW_MS = 3000;
const localTxAt = new Map<string, number>();

/** Call before the request (the echo can beat the response) and again on success. */
export function markLocalTransaction(clientId: string) {
  localTxAt.set(clientId, Date.now());
}

export function isLocalTransactionEcho(clientId: string): boolean {
  const at = localTxAt.get(clientId);
  if (at === undefined) return false;
  if (Date.now() - at > LOCAL_TX_ECHO_WINDOW_MS) {
    localTxAt.delete(clientId);
    return false;
  }
  return true;
}

/** Statistics screen figures: only marked stale, refetched when the screen next opens. */
export function markDashboardStale(qc: QueryClient) {
  for (const queryKey of [
    queryKeys.dashboardKpis,
    queryKeys.dashboardTrendsRoot,
    queryKeys.dashboardDistribution,
    queryKeys.dashboardGames,
  ]) {
    qc.invalidateQueries({ queryKey, refetchType: 'none' });
  }
}

/**
 * Everything a recorded transaction changes (stamps, reward, adjustment, coupon redeemed):
 * the client at the till and in its detail, the history, the home stats, then the
 * client lists and statistics, which are only marked stale.
 */
export function invalidateAfterTransaction(qc: QueryClient, clientId?: string) {
  if (clientId) {
    markLocalTransaction(clientId);
    qc.invalidateQueries({ queryKey: queryKeys.clientStatus(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.clientDetail(clientId) });
  }
  qc.invalidateQueries({ queryKey: queryKeys.transactions });
  qc.invalidateQueries({ queryKey: queryKeys.homeStats });
  // The Clients tab reloads its lists when it regains focus.
  qc.invalidateQueries({ queryKey: queryKeys.clientsRoot, refetchType: 'none' });
  markDashboardStale(qc);
}
