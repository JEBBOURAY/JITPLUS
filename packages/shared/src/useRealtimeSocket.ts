/**
 * React hook for real-time Socket.IO connection with auto-reconnect.
 *
 * Usage (in app _layout.tsx or a provider):
 *   import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
 *
 *   const socket = useRealtimeSocket({
 *     serverUrl: getServerBaseUrl(),
 *     getToken: () => SecureStore.getItemAsync('auth_token'),
 *     enabled: !!user,
 *   });
 *
 * The hook returns the Socket instance (or null if not connected).
 * It auto-reconnects on token change and disconnects on unmount.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';

export interface RealtimeSocketConfig {
  /** Server base URL (without /api/v1), e.g. http://192.168.1.10:3000 */
  serverUrl: string;
  /** Async function to get the current JWT token */
  getToken: () => Promise<string | null>;
  /** Only connect when true (e.g. user is authenticated) */
  enabled: boolean;
}

export function useRealtimeSocket(config: RealtimeSocketConfig): Socket | null {
  const { serverUrl, getToken, enabled } = config;
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  // Store getToken in a ref to avoid re-triggering effects when the
  // caller passes an unstable inline function.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const authFailures = useRef(0);
  const MAX_AUTH_FAILURES = 5;
  const connectErrorCountRef = useRef(0);
  const lastConnectErrorLogAtRef = useRef(0);

  const connect = useCallback(async () => {
    // Disconnect previous socket if any
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const token = await getTokenRef.current();
    if (!token) return;

    authFailures.current = 0;

    const newSocket = io(serverUrl, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 10000,
    });

    // Refresh token on every reconnect attempt so expired JWTs are replaced
    newSocket.io.on('reconnect_attempt', async () => {
      const freshToken = await getTokenRef.current();
      if (freshToken) {
        (newSocket.auth as Record<string, string>).token = freshToken;
      }
    });

    newSocket.on('connect', () => {
      authFailures.current = 0;
      connectErrorCountRef.current = 0;
      if (__DEV__) console.log('[WS] Connected:', newSocket.id);
    });

    newSocket.on('disconnect', (reason: string) => {
      if (__DEV__) console.log('[WS] Disconnected:', reason);
      // Server kicked us (auth failure) — refresh token before reconnecting
      if (reason === 'io server disconnect') {
        authFailures.current += 1;
        if (authFailures.current >= MAX_AUTH_FAILURES) {
          if (__DEV__) console.warn('[WS] Too many auth failures, stopping reconnection');
          newSocket.disconnect();
        } else {
          // Re-fetch token and reconnect with fresh credentials
          getTokenRef.current().then((freshToken) => {
            if (freshToken) {
              (newSocket.auth as Record<string, string>).token = freshToken;
              newSocket.connect();
            }
          });
        }
      }
    });

    newSocket.on('auth_error', () => {
      if (__DEV__) console.warn('[WS] Auth error received, disconnecting');
      newSocket.disconnect();
    });

    if (__DEV__) {
      newSocket.on('connect_error', (err: Error) => {
        connectErrorCountRef.current += 1;
        const attempts = connectErrorCountRef.current;
        const now = Date.now();
        const message = err.message || 'unknown error';

        // Avoid flooding Metro logs when backend/ws endpoint is unreachable.
        if (attempts <= 3 || now - lastConnectErrorLogAtRef.current > 30000) {
          console.log(`[WS] Error (${attempts}):`, message);
          lastConnectErrorLogAtRef.current = now;
        } else if (attempts === 4) {
          console.log('[WS] Repeated connection errors suppressed for 30s');
        }
      });
    }

    socketRef.current = newSocket;
    setSocket(newSocket);
  }, [serverUrl]);

  // Connect when enabled changes
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [enabled, connect]);

  // Reconnect when app returns from background
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && enabled && !socketRef.current?.connected) {
        connect();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [enabled, connect]);

  return socket;
}
