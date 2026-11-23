import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pull-to-refresh state that follows the user's pull only. A query's
 * `isRefetching` is also true for background refetches (polling, socket
 * invalidations, focus), which flashed the spinner on screens nobody pulled.
 * A second pull while one runs is ignored.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const onRefresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    try {
      await refreshRef.current();
    } catch { /* the queries surface their own errors */ } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, []);

  return { refreshing, onRefresh };
}
