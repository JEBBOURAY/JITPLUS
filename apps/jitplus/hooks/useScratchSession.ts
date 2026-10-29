import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { haptic, hapticSelection, hapticSuccess } from '@/utils/haptics';
import {
  invalidateScratchCards, useMarkScratchCardOpened, useScratchCard, useScratchCardByCampaign, useScratchCardDraw,
} from '@/hooks/useScratchHooks';
import { SCRATCH_REVEAL_THRESHOLD } from '@jitplus/shared/src/scratch';
import type { CouponDto } from '@jitplus/shared/src/scratch';

const GRID = 16;
const CELLS = GRID * GRID;
export const BRUSH = 26; // radius of the scratch stroke
const TICK_EVERY_CELLS = 8;
// Points closer than this to the previous one are not appended to the stroke:
// the brush is 52 px wide, and a shorter path string keeps each mask redraw cheap.
const MIN_SEGMENT = 3;
// A lone moveto is never stroked, so this path erases nothing.
const EMPTY_SCRATCH_PATH = 'M-99 -99';

/** Scratch card screen state: card loading, draw request, scratch gesture, reveal and animations. */
export function useScratchSession(id: string | undefined, isCampaignMode: boolean, zoneW: number, zoneH: number) {
  const byId = useScratchCard(isCampaignMode ? undefined : id, !isCampaignMode);
  const byCampaign = useScratchCardByCampaign(isCampaignMode ? id : undefined, isCampaignMode);
  const card = isCampaignMode ? byCampaign.data : byId.data;
  const isLoading = isCampaignMode ? byCampaign.isLoading : byId.isLoading;
  const isError = isCampaignMode ? byCampaign.isError : byId.isError;

  const queryClient = useQueryClient();
  const markOpened = useMarkScratchCardOpened();
  const draw = useScratchCardDraw();

  const [coupon, setCoupon] = useState<CouponDto | null>(null);
  const [drawError, setDrawError] = useState(false);
  const [drawGone, setDrawGone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [coverGone, setCoverGone] = useState(false);
  const [showRevealAll, setShowRevealAll] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const cardId = card?.id;
  const isPending = card?.status === 'PENDING';
  // Frozen at first load: the draw response puts the card in the cache as
  // SCRATCHED, which must not remove the coating before the reveal threshold.
  const scratchableRef = useRef<boolean | null>(null);
  if (card && scratchableRef.current === null) scratchableRef.current = card.status === 'PENDING';
  const scratchable = scratchableRef.current === true;
  // A card reopened after scratching: the coupon comes with the card payload.
  const knownCoupon = coupon ?? card?.coupon ?? null;

  const scratchPath = useSharedValue(EMPTY_SCRATCH_PATH);
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);
  const grid = useSharedValue<number[]>(new Array(CELLS).fill(0));
  const scratchedCount = useSharedValue(0);
  const thresholdHit = useSharedValue(false);
  const coverOpacity = useSharedValue(1);
  const confettiProgress = useSharedValue(0);
  const cardEntrance = useSharedValue(0);
  const labelPulse = useSharedValue(1);

  const drawRequestedRef = useRef(false);
  const [scratchStarted, setScratchStarted] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    AccessibilityInfo.isScreenReaderEnabled().then((sr) => { if (sr) setShowRevealAll(true); }).catch(() => {});
  }, []);

  const hasCard = !!card;
  useEffect(() => {
    if (!hasCard) return;
    cardEntrance.value = reduceMotion ? 1 : withSpring(1, { damping: 14, stiffness: 120 });
  }, [hasCard, reduceMotion, cardEntrance]);

  const scratching = scratchable && !revealed;
  const showScratchLabel = scratching && !scratchStarted;
  useEffect(() => {
    if (!showScratchLabel || reduceMotion) {
      labelPulse.value = 1;
      return;
    }
    labelPulse.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [showScratchLabel, reduceMotion, labelPulse]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardEntrance.value,
    transform: [{ scale: 0.85 + cardEntrance.value * 0.15 }, { translateY: (1 - cardEntrance.value) * 24 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ transform: [{ scale: labelPulse.value }] }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.value }));
  const scratchPathProps = useAnimatedProps(() => ({ d: scratchPath.value }));

  // "Tout révéler" appears after 5 s even without a screen reader.
  useEffect(() => {
    if (!scratchable || revealed || showRevealAll) return;
    const timer = setTimeout(() => setShowRevealAll(true), 5000);
    return () => clearTimeout(timer);
  }, [scratchable, revealed, showRevealAll]);

  // Mark the card as opened (analytics) — fire and forget.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    if (cardId && isPending && openedRef.current !== cardId) {
      openedRef.current = cardId;
      markOpened.mutate(cardId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, isPending]);

  const triggerDraw = useCallback(() => {
    if (!cardId || drawRequestedRef.current) return;
    drawRequestedRef.current = true;
    setDrawError(false);
    draw.mutate(cardId, {
      onSuccess: (result) => setCoupon(result.coupon),
      onError: (err) => {
        // 410 = card expired / campaign cancelled / no reward left: retrying can
        // never succeed, so refetch the card to render its terminal state.
        if ((err as { response?: { status?: number } })?.response?.status === 410) {
          setDrawGone(true);
          invalidateScratchCards(queryClient);
          return;
        }
        drawRequestedRef.current = false;
        setDrawError(true);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    hapticSuccess();
    coverOpacity.value = withTiming(0, { duration: reduceMotion ? 0 : 450 }, (finished) => {
      if (finished) runOnJS(setCoverGone)(true);
    });
    if (!reduceMotion) {
      confettiProgress.value = withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  /** Marks the 16×16 grid cells under the finger; reveals past 55 %. Runs on the UI thread. */
  const markCells = useCallback((x: number, y: number) => {
    'worklet';
    const cw = zoneW / GRID;
    const ch = zoneH / GRID;
    const cxi = Math.floor(x / cw);
    const cyi = Math.floor(y / ch);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = cxi + dx;
        const cy = cyi + dy;
        if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
        // Only mark cells whose centre is within the brush radius.
        const ddx = (cx + 0.5) * cw - x;
        const ddy = (cy + 0.5) * ch - y;
        if (ddx * ddx + ddy * ddy > BRUSH * BRUSH) continue;
        const idx = cy * GRID + cx;
        if (grid.value[idx] === 0) {
          grid.value[idx] = 1;
          scratchedCount.value += 1;
          if (scratchedCount.value % TICK_EVERY_CELLS === 0) runOnJS(hapticSelection)();
        }
      }
    }
    if (!thresholdHit.value && scratchedCount.value / CELLS >= SCRATCH_REVEAL_THRESHOLD) {
      thresholdHit.value = true;
      runOnJS(handleReveal)();
    }
  }, [zoneW, zoneH, grid, scratchedCount, thresholdHit, handleReveal]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(!revealed)
    .minDistance(0)
    .onBegin((e) => {
      scratchPath.value += `M${Math.round(e.x)} ${Math.round(e.y)}`;
      lastX.value = e.x;
      lastY.value = e.y;
      markCells(e.x, e.y);
      runOnJS(triggerDraw)();
      runOnJS(setScratchStarted)(true);
      runOnJS(haptic)();
    })
    .onUpdate((e) => {
      markCells(e.x, e.y);
      const dx = e.x - lastX.value;
      const dy = e.y - lastY.value;
      if (dx * dx + dy * dy < MIN_SEGMENT * MIN_SEGMENT) return;
      scratchPath.value += `L${Math.round(e.x)} ${Math.round(e.y)}`;
      lastX.value = e.x;
      lastY.value = e.y;
    })
    .onFinalize((e) => {
      // A tap without movement still erases a dot (round cap on a tiny segment).
      scratchPath.value += `L${Math.round(e.x) + 0.1} ${Math.round(e.y)}`;
      markCells(e.x, e.y);
    }),
  [scratchPath, lastX, lastY, markCells, triggerDraw, revealed]);

  const revealAll = useCallback(() => {
    if (revealed) return;
    triggerDraw();
    haptic();
    handleReveal();
  }, [revealed, triggerDraw, handleReveal]);

  return {
    card,
    isLoading,
    isError,
    knownCoupon,
    drawError,
    drawGone,
    revealed,
    coverGone,
    showRevealAll,
    reduceMotion,
    scratchable,
    scratching,
    showScratchLabel,
    triggerDraw,
    revealAll,
    pan,
    cardStyle,
    labelStyle,
    coverStyle,
    scratchPathProps,
    confettiProgress,
  };
}
