import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStampsOverview } from '@/hooks/useQueryHooks';
import { useWsStore, type StampsEvent } from '@/stores/wsStore';
import type { LoyaltyCard } from '@/types';
import {
  createScanDeduper, detectBalanceScan, getScanPollInterval, scanEventKey, toBalanceMap,
} from '@/utils/qrScan';

interface Options {
  enabled: boolean;
  onScan: (event: StampsEvent, card: LoyaltyCard | undefined) => void;
}

/**
 * Detects a merchant scan while the QR screen is focused, from two sources:
 * the WebSocket / foreground push event, and a balance change in the polled
 * cards overview. The WebSocket event can be missed (expired token, or emitted
 * by another Cloud Run instance than the one holding this socket), so polling
 * stays on as a fallback, backing off the longer the QR stays on screen.
 */
export function useScanDetection({ enabled, onScan }: Options) {
  const [isFocused, setIsFocused] = useState(false);
  const isFocusedRef = useRef(false);
  const focusedAtRef = useRef(0);
  // Restarted on each scan: the cashier often scans again right after.
  const activeSinceRef = useRef(0);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const pollInterval = useCallback(
    () => getScanPollInterval(Date.now() - activeSinceRef.current, useWsStore.getState().connected),
    [],
  );
  const { data: stampsOverview, refetch } = useStampsOverview(enabled, isFocused && enabled ? pollInterval : false);

  const cardsRef = useRef(stampsOverview?.cards);
  useEffect(() => { cardsRef.current = stampsOverview?.cards; }, [stampsOverview]);
  const refetchRef = useRef(refetch);
  useEffect(() => { refetchRef.current = refetch; }, [refetch]);
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  // Last known balance per merchant, compared against each poll to detect a scan.
  const balancesRef = useRef<Map<string, number> | null>(null);
  const balancesReadyRef = useRef(false);
  const [isNewScan] = useState(() => createScanDeduper());

  const emit = useCallback((ev: StampsEvent) => {
    balancesRef.current?.set(ev.merchantId, ev.newBalance);
    if (!isNewScan(scanEventKey(ev))) return;
    activeSinceRef.current = Date.now();
    const card = cardsRef.current?.find((c) => c.merchantId === ev.merchantId);
    onScanRef.current({ ...ev, merchantName: ev.merchantName || card?.merchant?.nomBoutique || '' }, card);
  }, [isNewScan]);

  useFocusEffect(useCallback(() => {
    const now = Date.now();
    isFocusedRef.current = true;
    focusedAtRef.current = now;
    activeSinceRef.current = now;
    setIsFocused(true);
    // The cached balances may predate this visit: baseline on a fresh fetch
    // so changes made while away aren't replayed as a live scan.
    balancesReadyRef.current = false;
    if (enabledRef.current) {
      refetchRef.current()
        .then((res) => { if (res.data) balancesRef.current = toBalanceMap(res.data.cards); })
        .catch(() => {})
        .finally(() => { balancesReadyRef.current = true; });
    }
    return () => {
      isFocusedRef.current = false;
      setIsFocused(false);
    };
  }, []));

  useEffect(() => useWsStore.subscribe((state, prev) => {
    const ev = state.lastStampsEvent;
    if (!ev || ev === prev.lastStampsEvent || !isFocusedRef.current) return;
    if (ev.receivedAt < focusedAtRef.current) return;
    // Manual balance corrections from the merchant back-office aren't a scan.
    if (ev.type === 'ADJUST_STAMPS') return;
    emit(ev);
  }), [emit]);

  useEffect(() => {
    const cards = stampsOverview?.cards;
    if (!cards) return;
    const previous = balancesRef.current;
    balancesRef.current = toBalanceMap(cards);
    if (!previous || !balancesReadyRef.current || !isFocusedRef.current) return;
    const ev = detectBalanceScan(previous, cards);
    if (ev) emit(ev);
  }, [stampsOverview, emit]);
}
