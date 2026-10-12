import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity,
  useWindowDimensions, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle, Defs, G, LinearGradient as SvgLinearGradient, Mask, Path, Rect, Stop,
} from 'react-native-svg';
// Gesture-handler ScrollView: the scratch Pan (minDistance 0) activates on
// touch-down and cancels scrolling only while the finger is on the coating.
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  Easing, FadeIn, FadeInDown, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  AlertCircle, CalendarClock, Check, Clock, Hand, Info, QrCode, RefreshCw, Sparkles, Store, X,
} from 'lucide-react-native';

import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { haptic, hapticSelection, hapticSuccess } from '@/utils/haptics';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useAppFonts } from '@/utils/fonts';
import { formatDate } from '@/utils/date';
import { resolveImageUrl } from '@/utils/imageUrl';
import {
  invalidateScratchCards, useMarkScratchCardOpened, useScratchCard, useScratchCardByCampaign, useScratchCardDraw,
} from '@/hooks/useScratchHooks';
import {
  SCRATCH_REVEAL_THRESHOLD, describeCouponConditions, getScratchDesign, rewardDisplay,
} from '@jitplus/shared/src/scratch';
import type { CouponDto } from '@jitplus/shared/src/scratch';
import { ScratchCardFace, getScratchZone, scratchCardHeight } from '@jitplus/shared/src/scratch/ScratchCardFace';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const BG_GRADIENT = ['#24104A', '#150830', '#0B0418'] as const;
const GRID = 16;
const CELLS = GRID * GRID;
const BRUSH = 26; // radius of the scratch stroke
const TICK_EVERY_CELLS = 8;
// Points closer than this to the previous one are not appended to the stroke:
// the brush is 52 px wide, and a shorter path string keeps each mask redraw cheap.
const MIN_SEGMENT = 3;
// A lone moveto is never stroked, so this path erases nothing.
const EMPTY_SCRATCH_PATH = 'M-99 -99';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One confetti particle, driven by a shared progress value (0 → 1). */
function ConfettiParticle({
  progress, x0, vx, vy, size, color,
}: {
  progress: SharedValue<number>;
  x0: number; vx: number; vy: number; size: number; color: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) * 4),
      transform: [
        { translateX: x0 + vx * p - size },
        { translateY: -20 + vy * p + 0.5 * 900 * p * p - size },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.confetti,
        { width: size * 2, height: size * 2, borderRadius: size, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

export default function ScratchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, isRTL, locale } = useLanguage();
  const fonts = useAppFonts();
  const { width: screenW } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; mode?: string }>();
  const isCampaignMode = params.mode === 'campaign';

  const byId = useScratchCard(isCampaignMode ? undefined : params.id, !isCampaignMode);
  const byCampaign = useScratchCardByCampaign(isCampaignMode ? params.id : undefined, isCampaignMode);
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

  // ── Scratch layer (covers the zone under the merchant header) ──
  const cardW = Math.min(screenW - wp(40), 400);
  const cardH = scratchCardHeight(cardW);
  const zone = getScratchZone(cardW);
  const zoneW = zone.width;
  const zoneH = zone.height;
  const design = getScratchDesign(card?.campaign.designId);

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

  const confetti = useMemo(() => {
    const colors = [design.accent, '#FCD34D', '#FFFFFF', '#A78BFA', '#F472B6'];
    return Array.from({ length: 32 }, (_, i) => ({
      x0: Math.random() * screenW,
      vx: (Math.random() - 0.5) * 160,
      vy: 140 + Math.random() * 320,
      size: 3 + Math.random() * 4,
      color: colors[i % colors.length],
    }));
  }, [screenW, design.accent]);

  const reward = knownCoupon
    ? rewardDisplay({ type: knownCoupon.type, value: knownCoupon.value, label: knownCoupon.label }, t)
    : null;
  const rewardText = reward?.headline ?? null;

  const conditionLines = useMemo(() => {
    if (!knownCoupon) return [];
    return describeCouponConditions(knownCoupon, t, (iso) => formatDate(iso, locale));
  }, [knownCoupon, t, locale]);

  const goBack = useCallback(() => { router.back(); }, [router]);
  const openMyCard = useCallback(() => { router.dismissTo('/(tabs)/qr'); }, [router]);

  const merchantName = card?.merchant.nom ?? '';

  const renderState = (icon: React.ReactNode, title: string, action?: { label: string; onPress: () => void; icon?: React.ReactNode }) => (
    <View style={styles.stateWrap}>
      <View style={styles.stateCard}>
        <View style={styles.stateIcon}>{icon}</View>
        <Text style={[styles.stateTitle, { fontFamily: fonts.bold }]}>{title}</Text>
        <TouchableOpacity
          onPress={action?.onPress ?? goBack}
          activeOpacity={0.8}
          style={styles.ghostBtn}
          accessibilityRole="button"
        >
          {action?.icon}
          <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{action?.label ?? t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderResult = () => {
    if (!knownCoupon) {
      return (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(250)} style={styles.panel}>
          {drawError ? (
            <>
              <Text style={[styles.panelText, { fontFamily: fonts.medium }]}>{t('scratch.screen.drawError')}</Text>
              <TouchableOpacity onPress={triggerDraw} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
                <RefreshCw size={ms(16)} color="#fff" strokeWidth={2} />
                <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.revealingRow}>
              <ActivityIndicator color={palette.goldLight} />
              <Text style={[styles.panelText, { fontFamily: fonts.medium }]}>{t('scratch.screen.revealing')}</Text>
            </View>
          )}
        </Animated.View>
      );
    }

    const active = knownCoupon.status === 'ACTIVE';
    // describeCouponConditions ends with [..., expiry, single use].
    const expiryLine = knownCoupon.expiresAt ? conditionLines.length - 2 : -1;
    return (
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.delay(scratchable ? 250 : 0).springify().damping(16)}
        style={styles.panel}
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.kicker, { fontFamily: fonts.semibold }]}>{t('scratch.card.youWon')}</Text>
        <Text style={[styles.rewardTitle, { fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={3}>
          {rewardText}
        </Text>
        {!!reward?.detail && (
          <Text style={[styles.rewardDetail, { fontFamily: fonts.regular }]} numberOfLines={2}>{reward.detail}</Text>
        )}

        {active ? (
          <>
            <View style={styles.steps}>
              <Text style={[styles.stepsTitle, { fontFamily: fonts.semibold }]}>{t('scratch.screen.howToUse')}</Text>
              <View style={styles.stepRow}>
                <View style={styles.stepIcon}><Store size={ms(16)} color={palette.goldLight} strokeWidth={2} /></View>
                <Text style={[styles.stepText, { fontFamily: fonts.medium }]}>
                  {t('scratch.screen.stepVisit', { merchant: merchantName })}
                </Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepIcon}><QrCode size={ms(16)} color={palette.goldLight} strokeWidth={2} /></View>
                <Text style={[styles.stepText, { fontFamily: fonts.medium }]}>{t('scratch.screen.stepShowCard')}</Text>
              </View>
              <Text style={[styles.stepsNote, { fontFamily: fonts.regular }]}>{t('scratch.screen.noCouponNeeded')}</Text>
            </View>

            {conditionLines.length > 0 && (
              <View style={styles.conditions}>
                <Text style={[styles.conditionsTitle, { fontFamily: fonts.semibold }]}>{t('scratch.screen.conditions')}</Text>
                {conditionLines.map((line, i) => (
                  <View key={i} style={styles.conditionRow}>
                    {i === expiryLine
                      ? <CalendarClock size={ms(14)} color={palette.goldLight} strokeWidth={2} />
                      : <Check size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={2.4} />}
                    <Text style={[styles.conditionText, { fontFamily: fonts.regular }]}>{line}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.statusPill}>
            <Text style={[styles.statusText, { fontFamily: fonts.semibold }]}>
              {knownCoupon.status === 'REDEEMED' && knownCoupon.redeemedAt
                ? t('scratch.coupons.usedOn', { date: formatDate(knownCoupon.redeemedAt, locale) })
                : t(`scratch.couponStatus.${knownCoupon.status}`)}
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={goBack} activeOpacity={0.85} style={styles.primaryWrap} accessibilityRole="button">
          <LinearGradient
            colors={[palette.goldSoft, palette.goldLight, palette.goldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.primary}
          >
            <Text style={[styles.primaryText, { fontFamily: fonts.bold }]}>{t('scratch.screen.done')}</Text>
          </LinearGradient>
        </TouchableOpacity>
        {active && (
          <TouchableOpacity onPress={openMyCard} activeOpacity={0.7} style={styles.secondary} accessibilityRole="button">
            <Text style={[styles.secondaryText, { fontFamily: fonts.semibold }]}>{t('scratch.screen.openMyCard')}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.stateWrap}>
          <View style={[styles.placeholder, { width: cardW, height: cardH }]}>
            <ActivityIndicator color={palette.goldLight} />
          </View>
          <Text style={[styles.hint, { fontFamily: fonts.regular }]}>{t('scratch.screen.loading')}</Text>
        </View>
      );
    }
    if (isError || !card) {
      return renderState(<AlertCircle size={ms(28)} color="#F87171" strokeWidth={1.8} />, t('scratch.screen.notFound'));
    }
    if (card.status === 'EXPIRED' || card.status === 'CANCELLED') {
      return renderState(
        <Clock size={ms(28)} color={palette.goldLight} strokeWidth={1.8} />,
        card.status === 'EXPIRED' ? t('scratch.screen.expired') : t('scratch.screen.cancelled'),
      );
    }
    if (drawGone && !knownCoupon) {
      return renderState(<Clock size={ms(28)} color={palette.goldLight} strokeWidth={1.8} />, t('scratch.screen.unavailable'));
    }

    const coverVisible = scratchable && !coverGone;
    const zoneStyle = { left: zone.x, top: zone.y, width: zoneW, height: zoneH, borderRadius: zone.radius };

    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + hp(28) }]}
        showsVerticalScrollIndicator={false}
      >
        {scratching && (
          <View style={styles.intro}>
            <Text style={[styles.introTitle, { fontFamily: fonts.bold }]}>{t('scratch.screen.headline')}</Text>
            <View style={styles.pills}>
              <View style={styles.pill}>
                <Sparkles size={ms(13)} color={palette.goldLight} strokeWidth={2} />
                <Text style={[styles.pillText, { fontFamily: fonts.semibold }]}>{t('scratch.card.alwaysWin')}</Text>
              </View>
              <View style={[styles.pill, styles.pillMuted]}>
                <Clock size={ms(13)} color="rgba(255,255,255,0.75)" strokeWidth={2} />
                <Text style={[styles.pillText, styles.pillTextMuted, { fontFamily: fonts.medium }]}>
                  {t('scratch.card.expiresOn', { date: formatDate(card.expiresAt, locale) })}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Animated.View style={[styles.cardWrap, cardStyle]}>
          <View pointerEvents="none" style={[styles.cardGlow, { width: cardW * 0.85, height: cardH * 0.7, backgroundColor: design.gradient[0] }]} />
          <View style={[styles.cardShadow, { width: cardW, height: cardH }]}>
            <ScratchCardFace
              designId={card.campaign.designId}
              width={cardW}
              merchantName={card.merchant.nom}
              logoUrl={card.merchant.logoUrl ? resolveImageUrl(card.merchant.logoUrl) : null}
              caption={knownCoupon ? t('scratch.card.youWon') : t('scratch.card.alwaysWin')}
              rewardText={rewardText}
              rewardDetail={reward?.detail}
              footer={card.campaign.name || t('scratch.card.offeredBy', { merchant: card.merchant.nom })}
              isRTL={isRTL}
            />
            {coverVisible && (
              <GestureDetector gesture={pan}>
                <View
                  style={[styles.zone, zoneStyle]}
                  pointerEvents={scratching ? 'auto' : 'none'}
                  accessibilityLabel={t('scratch.card.scratchHere')}
                >
                  <Animated.View style={[StyleSheet.absoluteFill, coverStyle]}>
                    <Svg width={zoneW} height={zoneH}>
                      <Defs>
                        <SvgLinearGradient id="scratchCover" x1={0} y1={0} x2={zoneW} y2={zoneH} gradientUnits="userSpaceOnUse">
                          <Stop offset={0} stopColor={design.cover[0]} />
                          <Stop offset={1} stopColor={design.cover[1]} />
                        </SvgLinearGradient>
                        {/* Luminance mask: white keeps the coating, the black stroke erases it. */}
                        <Mask id="scratchMask" x={0} y={0} width={zoneW} height={zoneH} maskUnits="userSpaceOnUse">
                          <Rect x={0} y={0} width={zoneW} height={zoneH} fill="#fff" />
                          <AnimatedPath
                            animatedProps={scratchPathProps}
                            fill="none"
                            stroke="#000"
                            strokeWidth={BRUSH * 2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Mask>
                      </Defs>
                      <G mask="url(#scratchMask)">
                        <Rect x={0} y={0} width={zoneW} height={zoneH} fill="url(#scratchCover)" />
                        {/* Subtle pattern so the cover reads as a coating */}
                        {Array.from({ length: 5 }, (_, row) => Array.from({ length: 10 }, (__, col) => (
                          <Circle
                            key={`${row}-${col}`}
                            cx={(col + 0.5 + (row % 2) * 0.5) * (zoneW / 10)}
                            cy={(row + 0.5) * (zoneH / 5)}
                            r={ms(6)}
                            fill="#fff"
                            fillOpacity={0.18}
                          />
                        )))}
                      </G>
                    </Svg>
                  </Animated.View>
                </View>
              </GestureDetector>
            )}
            {showScratchLabel && (
              <View pointerEvents="none" style={[styles.zone, zoneStyle, styles.scratchLabelWrap]}>
                <Animated.View style={[styles.scratchLabelPill, labelStyle]}>
                  <Hand size={ms(16)} color="#fff" />
                  <Text style={[styles.scratchLabelText, { fontFamily: fonts.bold }]}>{t('scratch.card.scratchHere')}</Text>
                </Animated.View>
              </View>
            )}
          </View>
        </Animated.View>

        {scratching ? (
          <View style={styles.scratchHelp}>
            <Text style={[styles.hint, { fontFamily: fonts.regular }]}>{t('scratch.screen.hint')}</Text>
            {drawError && (
              <TouchableOpacity onPress={triggerDraw} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
                <RefreshCw size={ms(16)} color="#fff" strokeWidth={2} />
                <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('scratch.screen.drawError')}</Text>
              </TouchableOpacity>
            )}
            {showRevealAll && (
              <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)}>
                <TouchableOpacity onPress={revealAll} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
                  <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('scratch.screen.revealAll')}</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        ) : (
          renderResult()
        )}

        {!!card.campaign.message && (
          <View style={styles.message}>
            <Text style={[styles.messageLabel, { fontFamily: fonts.semibold }]}>
              {t('scratch.screen.messageFrom', { merchant: merchantName })}
            </Text>
            <Text style={[styles.messageText, { fontFamily: fonts.regular }]}>{card.campaign.message}</Text>
          </View>
        )}

        <View style={styles.legal}>
          <View style={styles.legalHeader}>
            <Info size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={2} />
            <Text style={[styles.legalTitle, { fontFamily: fonts.semibold }]}>{t('scratch.rules.title')}</Text>
          </View>
          <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('scratch.rules.body')}</Text>
        </View>
      </ScrollView>
    );
  };

  return (
    <LinearGradient colors={BG_GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + hp(8) }]}>
        <TouchableOpacity
          onPress={goBack}
          activeOpacity={0.7}
          style={styles.iconBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <X size={ms(20)} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
          {t('scratch.card.title')}
        </Text>
        <View style={styles.iconBtnSpacer} />
      </View>
      {renderBody()}
      {revealed && !reduceMotion && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {confetti.map((p, i) => (
            <ConfettiParticle key={i} progress={confettiProgress} {...p} />
          ))}
        </View>
      )}
    </LinearGradient>
  );
}

const ICON_BTN = ms(40);

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(16),
    paddingBottom: hp(8),
  },
  headerTitle: { flex: 1, color: '#fff', fontSize: FS.lg, textAlign: 'center', marginHorizontal: ms(8) },
  iconBtn: {
    width: ICON_BTN,
    height: ICON_BTN,
    borderRadius: ICON_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBtnSpacer: { width: ICON_BTN, height: ICON_BTN },

  scroll: { alignItems: 'center', paddingTop: hp(10), paddingHorizontal: wp(20) },

  intro: { alignItems: 'center', marginBottom: hp(18), gap: hp(10) },
  introTitle: { color: '#fff', fontSize: FS['2xl'], textAlign: 'center', letterSpacing: -0.3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: ms(8) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  pillMuted: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
  pillText: { color: palette.goldLight, fontSize: FS.xs },
  pillTextMuted: { color: 'rgba(255,255,255,0.75)' },

  cardWrap: { alignItems: 'center', justifyContent: 'center' },
  cardGlow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.45,
    shadowColor: palette.violetVivid,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 50,
  },
  cardShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 16,
  },
  zone: { position: 'absolute', overflow: 'hidden' },
  confetti: { position: 'absolute', left: 0, top: 0 },
  scratchLabelWrap: { alignItems: 'center', justifyContent: 'center' },
  scratchLabelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: wp(18),
    paddingVertical: hp(8),
    borderRadius: 999,
  },
  scratchLabelText: { color: '#fff', fontSize: FS.md, letterSpacing: 0.4 },

  scratchHelp: { alignItems: 'center', gap: hp(12), marginTop: hp(18) },
  hint: { color: 'rgba(255,255,255,0.65)', fontSize: FS.sm, textAlign: 'center', paddingHorizontal: wp(16) },

  panel: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: hp(20),
    padding: ms(18),
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    gap: hp(4),
  },
  revealingRow: { flexDirection: 'row', alignItems: 'center', gap: ms(10), paddingVertical: hp(6) },
  panelText: { color: 'rgba(255,255,255,0.8)', fontSize: FS.sm, textAlign: 'center' },
  kicker: { color: palette.goldLight, fontSize: FS.xs, textTransform: 'uppercase', letterSpacing: 1.2 },
  rewardTitle: { color: '#fff', fontSize: FS['2xl'], textAlign: 'center', letterSpacing: -0.4, marginTop: hp(2) },
  rewardDetail: { color: 'rgba(255,255,255,0.7)', fontSize: FS.sm, textAlign: 'center' },

  steps: {
    alignSelf: 'stretch',
    marginTop: hp(14),
    padding: ms(14),
    borderRadius: radius.lg,
    backgroundColor: 'rgba(124,58,237,0.18)',
    gap: hp(10),
  },
  stepsTitle: { color: '#fff', fontSize: FS.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: ms(10) },
  stepIcon: {
    width: ms(30),
    height: ms(30),
    borderRadius: ms(15),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.14)',
  },
  stepText: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: FS.sm, lineHeight: ms(19) },
  stepsNote: { color: 'rgba(255,255,255,0.55)', fontSize: FS.xs, lineHeight: ms(17) },

  conditions: { alignSelf: 'stretch', marginTop: hp(12), gap: hp(6) },
  conditionsTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: FS.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: hp(2),
  },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: ms(8) },
  conditionText: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: FS.sm },

  statusPill: {
    marginTop: hp(12),
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statusText: { color: 'rgba(255,255,255,0.85)', fontSize: FS.sm },

  primaryWrap: {
    alignSelf: 'stretch',
    marginTop: hp(18),
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: palette.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  primary: { height: ms(52), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  primaryText: { color: '#3B1D06', fontSize: FS.md },
  secondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: hp(12) },
  secondaryText: { color: 'rgba(255,255,255,0.75)', fontSize: FS.sm },

  message: {
    alignSelf: 'stretch',
    marginTop: hp(18),
    padding: ms(14),
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderLeftWidth: 3,
    borderLeftColor: palette.goldLight,
    gap: hp(4),
  },
  messageLabel: { color: 'rgba(255,255,255,0.55)', fontSize: FS.xs },
  messageText: { color: 'rgba(255,255,255,0.9)', fontSize: FS.sm, lineHeight: ms(20), fontStyle: 'italic' },

  legal: { alignSelf: 'stretch', marginTop: hp(22), gap: hp(6) },
  legalHeader: { flexDirection: 'row', alignItems: 'center', gap: ms(6) },
  legalTitle: { color: 'rgba(255,255,255,0.7)', fontSize: FS.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  legalText: { color: 'rgba(255,255,255,0.45)', fontSize: ms(11), lineHeight: ms(16) },

  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(24), paddingBottom: hp(60), gap: hp(14) },
  placeholder: {
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  stateCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: hp(10),
    paddingVertical: hp(24),
    paddingHorizontal: wp(20),
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  stateIcon: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stateTitle: { color: '#fff', fontSize: FS.lg, textAlign: 'center' },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    paddingHorizontal: ms(18),
    height: ms(42),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ghostBtnText: { color: '#fff', fontSize: FS.sm },
});
