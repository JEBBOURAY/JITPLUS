import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { api } from '@/services/api';
import { QR_TOKEN_KEY } from '@/services/api/storage';
import { getRefreshDelayS } from '@/utils/qrScan';

export type QrErrorKind = 'offline' | 'server' | null;

/**
 * Loads the client's QR token while the screen is focused.
 *  - v2 tokens are short-lived (~60s) and single-use: never cached, refreshed before expiry.
 *  - v1 legacy permanent tokens are cached in SecureStore so the QR still shows offline.
 */
export function useQrToken(clientId: string | undefined) {
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  // Null for v1 permanent tokens.
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrError, setQrError] = useState<QrErrorKind>(null);
  const [isOffline, setIsOffline] = useState(false);
  const qrErrorRef = useRef<QrErrorKind>(null);
  // Read by the NetInfo listener without re-subscribing it on every change.
  useEffect(() => { qrErrorRef.current = qrError; }, [qrError]);
  const isFocusedRef = useRef(false);
  const fetchingRef = useRef(false);
  // A refresh requested mid-fetch (focus, expiry timer, scan) is replayed once
  // the current fetch ends instead of being dropped.
  const fetchPendingRef = useRef(false);

  const fetchQrToken = useCallback(async () => {
    if (!clientId) return;
    if (fetchingRef.current) { fetchPendingRef.current = true; return; }
    fetchingRef.current = true;

    const loadQrToken = async () => {
      let cachedV1: string | null = null;
      try {
        const cached = Platform.OS === 'web' ? null : await SecureStore.getItemAsync(QR_TOKEN_KEY);
        if (cached && cached.startsWith('v1.')) {
          cachedV1 = cached;
          setQrValue(`jitplus://scan/${cached}`);
          setQrExpiresAt(null);
          setQrLoading(false);
          // Still fetch: the server may have moved this client to v2.
        }
      } catch { /* ignore cache miss */ }

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        setIsOffline(true);
        // Only a cached v1 token is still valid offline; a leftover v2 token is
        // about to expire (or already has), so don't show a code that won't scan.
        if (!cachedV1) { setQrValue(null); setQrError('offline'); setQrLoading(false); }
        return;
      }
      setIsOffline(false);
      setQrError(null);
      try {
        const resp = await api.getQrToken();
        const qrToken = resp.qr_token;
        const expiresAt = (resp as { expiresAt?: number }).expiresAt;
        if (Platform.OS !== 'web') {
          if (qrToken.startsWith('v1.')) {
            await SecureStore.setItemAsync(QR_TOKEN_KEY, qrToken);
          } else {
            await SecureStore.deleteItemAsync(QR_TOKEN_KEY).catch(() => {});
          }
        }
        setQrValue(`jitplus://scan/${qrToken}`);
        setQrExpiresAt(typeof expiresAt === 'number' ? expiresAt : null);
      } catch (e) {
        if (__DEV__) console.warn('QR token error:', e);
        // A permanent v1 token stays scannable when the server is unreachable.
        if (!cachedV1) {
          setQrValue(null);
          setQrError('server');
        }
      } finally {
        setQrLoading(false);
      }
    };

    try {
      do {
        fetchPendingRef.current = false;
        await loadQrToken();
      } while (fetchPendingRef.current);
    } finally {
      fetchingRef.current = false;
    }
  }, [clientId]);

  const retry = useCallback(() => {
    setQrError(null);
    setQrLoading(true);
    fetchQrToken();
  }, [fetchQrToken]);

  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    fetchQrToken();
    // Recover automatically when the connection comes back.
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false;
      setIsOffline(offline);
      if (!offline && qrErrorRef.current === 'offline') {
        setQrLoading(true);
        fetchQrToken();
      }
    });
    return () => {
      isFocusedRef.current = false;
      unsubscribeNet();
    };
  }, [fetchQrToken]));

  // `qrValue` is a dependency so every new token restarts the countdown bar too.
  const refreshDelayMs = useMemo(
    () => (qrExpiresAt ? getRefreshDelayS(qrExpiresAt) * 1000 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qrExpiresAt, qrValue],
  );
  useEffect(() => {
    if (!qrExpiresAt) return;
    const timer = setTimeout(() => {
      if (isFocusedRef.current) fetchQrToken();
    }, refreshDelayMs);
    return () => clearTimeout(timer);
  }, [qrExpiresAt, refreshDelayMs, fetchQrToken]);

  return { qrValue, qrLoading, qrExpiresAt, qrError, isOffline, refreshDelayMs, fetchQrToken, retry };
}
