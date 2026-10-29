import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Animated, Easing, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { hp } from '@/utils/responsive';
import { extractErrorMessage } from '@/utils/errorMessage';
import { useLuckyWheelAvailableDraws, useTriggerLuckyWheelDraw, useLuckyWheelHistory } from '@/hooks/useQueryHooks';
import { haptic, hapticSelection, hapticSuccess, HapticStyle } from '@/utils/haptics';
import {
  buildWheelSegments, computeLandingRotation, getDrawStatus, groupTicketsByCampaign,
  pickTargetSegment, segmentAtPointer,
} from '@/utils/luckyWheel';
import type { LuckyWheelCampaign, LuckyWheelDrawResult } from '@/types';

// Cruise speed (deg/s). The spin-up ends at this speed and the landing starts
// at it, so the hand-off between the two animations is seamless.
const CRUISE_SPEED = 960;
const SPIN_UP_DEG = 180;
const SPIN_UP_MS = ((2 * SPIN_UP_DEG) / CRUISE_SPEED) * 1000;
const MIN_SPIN_MS = 900;
const MIN_LANDING_TRAVEL = 360 * 4.5;
const MIN_LANDING_MS = 2800;
const TICK_HAPTIC_INTERVAL_MS = 80;

export type WheelPhase = 'wheel' | 'history';

export interface ShownResult {
  data: LuckyWheelDrawResult;
  merchantName: string;
  remaining: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useLuckyWheel(visible: boolean, onClose: () => void) {
  const { t } = useLanguage();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const {
    data: tickets = [], isLoading, isError, refetch,
  } = useLuckyWheelAvailableDraws(isAuthenticated && visible);
  const { data: historyData = [], isLoading: historyLoading } = useLuckyWheelHistory(isAuthenticated && visible);
  const drawMutation = useTriggerLuckyWheelDraw();

  const [phase, setPhase] = useState<WheelPhase>('wheel');
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ShownResult | null>(null);
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  // Freezes the wheel on the campaign being played: the ticket list refetches
  // mid-spin and must not swap the segments under the pointer.
  const [lockedCampaign, setLockedCampaign] = useState<LuckyWheelCampaign | null>(null);
  const [autoSpin, setAutoSpin] = useState(false);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pointerKick = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(1)).current;
  const rotationRef = useRef(0);
  const rampRef = useRef<Animated.CompositeAnimation | null>(null);
  const spinLockRef = useRef(false);
  const mountedRef = useRef(true);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const available = useMemo(
    () => tickets.filter((tk) => !tk.used && !usedIds.includes(tk.id)),
    [tickets, usedIds],
  );
  const groups = useMemo(() => groupTicketsByCampaign(available), [available]);
  const group = groups.find((g) => g.campaignId === selectedCampaignId) ?? groups[0];
  const ticket = group?.tickets[0];
  const campaign = lockedCampaign ?? ticket?.campaign ?? null;
  const availableCountRef = useRef(0);
  availableCountRef.current = available.length;

  const pendingCount = useMemo(
    () => historyData.filter((d) => getDrawStatus(d) === 'pending').length,
    [historyData],
  );

  const lostLabel = t('luckyWheel.lostShort');
  const segments = useMemo(
    () => (campaign?.prizes?.length
      ? buildWheelSegments(campaign.prizes, campaign.globalWinRate ?? 0, lostLabel)
      : undefined),
    [campaign, lostLabel],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setPhase('wheel');
    setResult(null);
    setSpinning(false);
    setUsedIds([]);
    setSelectedCampaignId(null);
    setLockedCampaign(null);
    setAutoSpin(false);
    spinLockRef.current = false;
    entrance.setValue(0);
    Animated.spring(entrance, { toValue: 1, damping: 14, stiffness: 110, useNativeDriver: true }).start();
  }, [visible, entrance]);

  useEffect(() => {
    contentFade.setValue(0);
    Animated.timing(contentFade, {
      toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [phase, contentFade]);

  // Pointer flick + light tick each time a segment boundary passes the pointer.
  useEffect(() => {
    const count = segments?.length ?? 0;
    if (!count) return undefined;
    let last = segmentAtPointer(rotationRef.current, count);
    let lastHaptic = 0;
    const id = spinAnim.addListener(({ value }) => {
      rotationRef.current = value;
      const idx = segmentAtPointer(value, count);
      if (idx === last) return;
      last = idx;
      pointerKick.setValue(1);
      Animated.spring(pointerKick, {
        toValue: 0, stiffness: 320, damping: 14, mass: 0.6, useNativeDriver: true,
      }).start();
      const now = Date.now();
      if (now - lastHaptic > TICK_HAPTIC_INTERVAL_MS) {
        lastHaptic = now;
        hapticSelection();
      }
    });
    return () => spinAnim.removeListener(id);
  }, [segments, spinAnim, pointerKick]);

  const stopSpin = useCallback(() => {
    rampRef.current?.stop();
    rampRef.current = null;
    spinAnim.stopAnimation((v) => { rotationRef.current = v; });
  }, [spinAnim]);

  const handleClose = useCallback(() => {
    stopSpin();
    spinLockRef.current = false;
    setSpinning(false);
    onClose();
  }, [onClose, stopSpin]);

  const dismissResult = useCallback(() => {
    setResult(null);
    setLockedCampaign(null);
  }, []);

  const handleSpin = useCallback(async () => {
    if (spinLockRef.current || !ticket || !segments?.length) return;
    const playedCampaign = ticket.campaign;
    const segs = segments;
    spinLockRef.current = true;
    setLockedCampaign(playedCampaign);
    setSelectedCampaignId(playedCampaign.id);
    setSpinning(true);
    haptic(HapticStyle.Medium);

    const start = rotationRef.current % 360;
    spinAnim.setValue(start);
    rotationRef.current = start;
    rampRef.current = Animated.sequence([
      Animated.timing(spinAnim, {
        toValue: start + SPIN_UP_DEG, duration: SPIN_UP_MS, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(spinAnim, {
        toValue: start + SPIN_UP_DEG + CRUISE_SPEED * 30, duration: 30_000, easing: Easing.linear, useNativeDriver: true,
      }),
    ]);
    rampRef.current.start();
    const minUntil = Date.now() + MIN_SPIN_MS;

    try {
      const res = await drawMutation.mutateAsync(ticket.id);
      if (!mountedRef.current || !visibleRef.current) return;
      setUsedIds((ids) => [...ids, ticket.id]);
      const remainingWait = minUntil - Date.now();
      if (remainingWait > 0) await wait(remainingWait);
      if (!mountedRef.current || !visibleRef.current || !spinLockRef.current) return;

      const target = pickTargetSegment(segs, res.result === 'WON' ? res.prize : null);
      rampRef.current?.stop();
      rampRef.current = null;
      spinAnim.stopAnimation((current) => {
        if (!mountedRef.current) return;
        const finalAngle = computeLandingRotation(current, target, segs.length, MIN_LANDING_TRAVEL, Math.random() - 0.5);
        // Ease-out quad starts at 2 × average speed: match it to the cruise speed.
        const duration = Math.max(MIN_LANDING_MS, ((2 * (finalAngle - current)) / CRUISE_SPEED) * 1000);
        Animated.timing(spinAnim, {
          toValue: finalAngle, duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start(({ finished }) => {
          if (!mountedRef.current || !finished) return;
          rotationRef.current = finalAngle;
          spinLockRef.current = false;
          setSpinning(false);
          setResult({
            data: res,
            merchantName: playedCampaign.merchant?.nom || playedCampaign.name,
            remaining: availableCountRef.current,
          });
          if (res.result === 'WON') hapticSuccess();
          else haptic(HapticStyle.Light);
        });
      });
    } catch (err) {
      rampRef.current?.stop();
      rampRef.current = null;
      spinAnim.stopAnimation((current) => {
        Animated.timing(spinAnim, {
          toValue: current + 90, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start();
      });
      spinLockRef.current = false;
      if (!mountedRef.current) return;
      setSpinning(false);
      setLockedCampaign(null);
      if (visibleRef.current) Alert.alert(t('common.error'), extractErrorMessage(err));
    }
  }, [ticket, segments, drawMutation, spinAnim, t]);

  const handleReplay = useCallback(() => {
    dismissResult();
    setAutoSpin(true);
  }, [dismissResult]);

  const handleSpinRef = useRef(handleSpin);
  handleSpinRef.current = handleSpin;

  // "Replay" from the result sheet spins straight away once the sheet is gone.
  // Reads handleSpin through a ref so a ticket refetch can't cancel the timer.
  useEffect(() => {
    if (!autoSpin || result || spinning) return undefined;
    const id = setTimeout(() => {
      setAutoSpin(false);
      void handleSpinRef.current();
    }, 280);
    return () => clearTimeout(id);
  }, [autoSpin, result, spinning]);

  const handleViewPrizes = useCallback(() => {
    dismissResult();
    setPhase('history');
  }, [dismissResult]);

  const handleRequestClose = useCallback(() => {
    if (result) dismissResult();
    else if (phase === 'history') setPhase('wheel');
    else handleClose();
  }, [result, phase, dismissResult, handleClose]);

  const openRules = useCallback(() => {
    handleClose();
    router.push('/legal/terms');
  }, [handleClose, router]);

  const showWheel = useCallback(() => setPhase('wheel'), []);
  const showHistory = useCallback(() => setPhase('history'), []);

  const spinRotation = spinAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const contentTranslate = contentFade.interpolate({ inputRange: [0, 1], outputRange: [hp(10), 0] });

  const canSpin = !!ticket && !!segments?.length && !spinning && !result;
  const spinsLeft = group?.tickets.length ?? 0;

  return {
    isLoading,
    isError,
    refetch,
    historyData,
    historyLoading,
    phase,
    spinning,
    result,
    groups,
    ticket,
    campaign,
    lockedCampaign,
    pendingCount,
    segments,
    pointerKick,
    entrance,
    contentFade,
    spinRotation,
    contentTranslate,
    canSpin,
    spinsLeft,
    setSelectedCampaignId,
    handleClose,
    dismissResult,
    handleSpin,
    handleReplay,
    handleViewPrizes,
    handleRequestClose,
    openRules,
    showWheel,
    showHistory,
  };
}
