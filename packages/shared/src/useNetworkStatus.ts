// ── Shared network status hook ──────────────────────────────────────────────
// Used by both JitPlus and JitPlus Pro apps — single source of truth.
import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Hook that monitors network connectivity.
 * Returns `isConnected` (null until first check, then boolean).
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  return { isConnected };
}
