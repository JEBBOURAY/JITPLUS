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

// Dev-only dedupe across fast remounts (e.g. React StrictMode double-invoke)
// to avoid printing the same WS error line twice in a row.
let lastDevWsErrorSig = '';
let lastDevWsErrorAt = 0;

/** After an auth rejection, poll the stored token for a refreshed one (~2 min max). */
const AUTH_RETRY_INTERVAL_MS = 4000;
const AUTH_RETRY_MAX_CHECKS = 30;

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
  // Bumped on every effect cleanup so a connect() still awaiting its token
  // after logout/unmount does not open an orphan socket.
  const connectGenRef = useRef(0);
  const connectingGenRef = useRef<number | null>(null);
  const authRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAuthRetry = useCallback(() => {
    if (authRetryTimerRef.current) {
      clearTimeout(authRetryTimerRef.current);
      authRetryTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    const gen = connectGenRef.current;
    if (connectingGenRef.current === gen) return;
    connectingGenRef.current = gen;
    clearAuthRetry();
    try {
      // Disconnect previous socket if any
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      const token = await getTokenRef.current();
      if (!token || gen !== connectGenRef.current) return;

      authFailures.current = 0;

      // The backend gateway only accepts 'websocket' (polling is disabled to
      // avoid recurring Cloud Run requests) — starting with 'polling' here
      // would make every handshake fail (400) since socket.io only upgrades
      // to websocket AFTER a successful polling connection. Only opt into
      // polling via the explicit env flag if the server is ever reconfigured
      // to support it.
      const allowPollingFallback = process.env.EXPO_PUBLIC_WS_ALLOW_POLLING === 'true';
      const transports: Array<'websocket' | 'polling'> = allowPollingFallback
        ? ['polling', 'websocket']
        : ['websocket'];

      const newSocket = io(serverUrl, {
        // Polling multiplies HTTP requests on Cloud Run and can increase costs
        // with many connected users. In production we default to websocket-only
        // and keep polling as an opt-in fallback via EXPO_PUBLIC_WS_ALLOW_POLLING=true.
        transports,
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      });
      socketRef.current = newSocket;

      // SECURITY: Re-fetch token from SecureStore on every reconnect attempt
      // to avoid reusing a token that was revoked server-side during a network interruption.
      newSocket.io.on('reconnect_attempt', async () => {
        if (socketRef.current !== newSocket) return;
        try {
          const freshToken = await getTokenRef.current();
          if (freshToken) {
            (newSocket.auth as Record<string, string>).token = freshToken;
          }
        } catch { /* use existing auth token */ }
      });

      newSocket.on('connect', () => {
        if (socketRef.current !== newSocket) return;
        authFailures.current = 0;
        connectErrorCountRef.current = 0;
        if (__DEV__) console.log('[WS] Connected:', newSocket.id);
      });

      newSocket.on('disconnect', (reason: string) => {
        if (socketRef.current !== newSocket) return;
        if (__DEV__) console.log('[WS] Disconnected:', reason);
        // Server kicked us (auth failure) — refresh token before reconnecting
        if (reason === 'io server disconnect') {
          authFailures.current += 1;
          if (authFailures.current >= MAX_AUTH_FAILURES) {
            if (__DEV__) console.warn('[WS] Too many auth failures, stopping reconnection');
            newSocket.disconnect();
          } else {
            getTokenRef.current().then((freshToken) => {
              if (freshToken && socketRef.current === newSocket) {
                (newSocket.auth as Record<string, string>).token = freshToken;
                newSocket.connect();
              }
            });
          }
        }
      });

      newSocket.on('auth_error', () => {
        if (socketRef.current !== newSocket) return;
        if (__DEV__) console.warn('[WS] Auth error received, disconnecting');
        newSocket.disconnect();
        // Usually an expired access token. The HTTP client refreshes the stored
        // token on its next request: wait for the stored token to change, then
        // reconnect with it instead of staying offline until the app restarts.
        const rejectedToken = (newSocket.auth as Record<string, string>).token;
        clearAuthRetry();
        const waitForFreshToken = (attempt: number) => {
          authRetryTimerRef.current = setTimeout(() => {
            authRetryTimerRef.current = null;
            // In background the foreground handler takes over the reconnection.
            if (socketRef.current !== newSocket || newSocket.connected || AppState.currentState !== 'active') return;
            getTokenRef.current().then((freshToken) => {
              if (socketRef.current !== newSocket || newSocket.connected) return;
              if (freshToken && freshToken !== rejectedToken) {
                (newSocket.auth as Record<string, string>).token = freshToken;
                newSocket.connect();
              } else if (attempt < AUTH_RETRY_MAX_CHECKS) {
                waitForFreshToken(attempt + 1);
              }
            }).catch(() => {});
          }, AUTH_RETRY_INTERVAL_MS);
        };
        waitForFreshToken(1);
      });

      if (__DEV__) {
        newSocket.on('connect_error', (err: Error) => {
          if (socketRef.current !== newSocket) return;

          connectErrorCountRef.current += 1;
          const attempts = connectErrorCountRef.current;
          const now = Date.now();
          const transport = newSocket.io.engine?.transport?.name ?? 'unknown';
          const details = err as Error & {
            description?: unknown;
            context?: unknown;
            type?: string;
          };
          const message = details.message || 'unknown error';
          const description = details.description
            ? typeof details.description === 'string'
              ? details.description
              : JSON.stringify(details.description)
            : '';
          const type = details.type ? ` [${details.type}]` : '';
          const extra = description ? ` | ${description}` : '';
          const sig = `${attempts}:${transport}:${message}:${description}`;

          // Deduplicate exact duplicate lines emitted almost simultaneously.
          if (sig === lastDevWsErrorSig && now - lastDevWsErrorAt < 1500) return;
          lastDevWsErrorSig = sig;
          lastDevWsErrorAt = now;

          // Avoid flooding Metro logs when backend/ws endpoint is unreachable.
          if (attempts <= 3 || now - lastConnectErrorLogAtRef.current > 30000) {
            console.log(`[WS] Error (${attempts}) [${transport}]${type}:`, `${message}${extra}`);
            lastConnectErrorLogAtRef.current = now;
          } else if (attempts === 4) {
            console.log('[WS] Repeated connection errors suppressed for 30s');
          }
        });
      }

      setSocket(newSocket);
    } finally {
      if (connectingGenRef.current === gen) connectingGenRef.current = null;
    }
  }, [serverUrl, clearAuthRetry]);

  // Connect when enabled changes
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      clearAuthRetry();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
    }

    return () => {
      connectGenRef.current += 1;
      clearAuthRetry();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [enabled, connect, clearAuthRetry]);

  // Disconnect in background, reconnect on foreground.
  // COST: a live WebSocket keeps a Cloud Run request (and its billed CPU) open.
  // Closing the socket when the app is backgrounded frees the connection slot
  // immediately so instances can scale down. Real-time delivery while
  // backgrounded is handled by FCM data pushes instead.
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        if (!enabled) return;
        const s = socketRef.current;
        if (!s) {
          connect();
        } else if (!s.connected && !s.active) {
          clearAuthRetry();
          // The handshake token may have expired while in background.
          getTokenRef.current()
            .then((freshToken) => {
              if (freshToken) (s.auth as Record<string, string>).token = freshToken;
            })
            .catch(() => {})
            .finally(() => {
              if (socketRef.current === s && !s.connected && !s.active) s.connect();
            });
        }
      } else if (nextState === 'background') {
        // Going to background → close the socket to release the server-side
        // connection (and its Cloud Run billing) right away. iOS 'inactive'
        // (Control Center, Face ID, system dialogs) is ignored: the app is
        // still on screen, and a real backgrounding always ends in 'background'.
        const s = socketRef.current;
        if (s && (s.connected || s.active)) {
          s.disconnect();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [enabled, connect, clearAuthRetry]);

  return socket;
}
