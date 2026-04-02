// ── Shared network status hook ──────────────────────────────────────────────
// Used by both JitPlus and JitPlus Pro apps — single source of truth.
import { useEffect, useState } from 'react';

// Lazy-load NetInfo — if the native module isn't linked the app still boots
let NetInfo: typeof import('@react-native-community/netinfo').default | null = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  // Native module unavailable — useNetworkStatus will always return null
}

/**
 * Hook that monitors network connectivity.
 * Returns `isConnected` (null until first check, then boolean).
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!NetInfo) return;
    const unsubscribe = NetInfo.addEventListener((state: any) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  return { isConnected };
}
