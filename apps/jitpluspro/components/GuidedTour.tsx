import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Animated,
  Easing,
  I18nManager,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect, Mask, Defs } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';

/**
 * Optional guided tour for the Accueil screen.
 *
 * Spotlights are drawn as a dimmed full-screen SVG rect with an animated
 * cut-out (a `<Rect>` in a `<Mask>`) positioned over the REAL element. Target
 * positions are measured at runtime with `measureInWindow` (window coordinates,
 * aligned with the transparent, status-bar-translucent Modal) — never hard-coded
 * — so the highlight stays correct on every screen size. A single rounded rect
 * covers both shapes: a circle is just a rect whose corner radius equals half
 * its size.
 *
 * The tour is purely explanatory: it mutates no data and is not part of the
 * setup checklist.
 */

// ── Public target keys ────────────────────────────────────
export type TourTargetKey =
  | 'avatar'
  | 'stores'
  | 'loyalty'
  | 'storecard'
  | 'wheel'
  | 'team'
  | 'dashboard'
  | 'clients'
  | 'scan'
  | 'messages'
  | 'support';

type Shape = 'circle' | 'rect';
interface Rectangle { x: number; y: number; width: number; height: number }
interface Box { x: number; y: number; w: number; h: number; r: number }
type MeasurableNode = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;

interface StepDef { key: TourTargetKey; shape: Shape; titleKey: string; textKey: string }

const STEP_DEFS: StepDef[] = [
  { key: 'avatar', shape: 'circle', titleKey: 'tour.avatarTitle', textKey: 'tour.avatarText' },
  { key: 'stores', shape: 'circle', titleKey: 'tour.storesTitle', textKey: 'tour.storesText' },
  { key: 'loyalty', shape: 'circle', titleKey: 'tour.loyaltyTitle', textKey: 'tour.loyaltyText' },
  { key: 'storecard', shape: 'circle', titleKey: 'tour.storecardTitle', textKey: 'tour.storecardText' },
  { key: 'wheel', shape: 'circle', titleKey: 'tour.wheelTitle', textKey: 'tour.wheelText' },
  { key: 'team', shape: 'circle', titleKey: 'tour.teamTitle', textKey: 'tour.teamText' },
  { key: 'dashboard', shape: 'rect', titleKey: 'tour.dashboardTitle', textKey: 'tour.dashboardText' },
  { key: 'clients', shape: 'rect', titleKey: 'tour.clientsTitle', textKey: 'tour.clientsText' },
  { key: 'scan', shape: 'circle', titleKey: 'tour.scanTitle', textKey: 'tour.scanText' },
  { key: 'messages', shape: 'rect', titleKey: 'tour.messagesTitle', textKey: 'tour.messagesText' },
  { key: 'support', shape: 'rect', titleKey: 'tour.supportTitle', textKey: 'tour.supportText' },
];

// ── Context ───────────────────────────────────────────────
interface TourContextValue {
  register: (key: TourTargetKey, node: MeasurableNode) => void;
  start: () => void;
  requestAutoStart: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

/** Access the tour controls (start / auto-start). Returns null outside the provider. */
export function useTour(): Pick<TourContextValue, 'start' | 'requestAutoStart'> | null {
  const ctx = useContext(TourContext);
  if (!ctx) return null;
  return { start: ctx.start, requestAutoStart: ctx.requestAutoStart };
}

/**
 * Register a view as a tour target. Attach the returned ref to the element to
 * spotlight and add `collapsable={false}` on Android so it stays measurable.
 */
export function useTourTarget(key?: TourTargetKey) {
  const ctx = useContext(TourContext);
  // `any` so the same ref can attach to View / TouchableOpacity / Animated.View.
  const ref = useRef<any>(null);
  useEffect(() => {
    if (!ctx || !key) return;
    ctx.register(key, ref.current as MeasurableNode);
    return () => ctx.register(key, null);
  });
  return ref;
}

type Phase = 'idle' | 'intro' | 'steps';

const OVERLAY_STEPS = 'rgba(11,15,20,0.72)';
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ── Provider ──────────────────────────────────────────────
export function GuidedTourProvider({ children }: { children: ReactNode }) {
  const targets = useRef<Map<TourTargetKey, MeasurableNode>>(new Map());
  const [phase, setPhase] = useState<Phase>('idle');

  const register = useCallback((key: TourTargetKey, node: MeasurableNode) => {
    if (node) targets.current.set(key, node);
    else targets.current.delete(key);
  }, []);

  const measure = useCallback(
    (key: TourTargetKey) =>
      new Promise<Rectangle | null>((resolve) => {
        const node = targets.current.get(key);
        if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
        try {
          node.measureInWindow((x, y, width, height) => {
            if (!width && !height) resolve(null);
            else resolve({ x, y, width, height });
          });
        } catch {
          resolve(null);
        }
      }),
    [],
  );

  const start = useCallback(() => setPhase('intro'), []);

  const requestAutoStart = useCallback(async () => {
    try {
      const shown = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.TOUR_AUTO_SHOWN);
      if (shown === 'true') return;
      await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.TOUR_AUTO_SHOWN, 'true');
      setPhase((p) => (p === 'idle' ? 'intro' : p));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({ register, start, requestAutoStart }),
    [register, start, requestAutoStart],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay phase={phase} setPhase={setPhase} measure={measure} />
    </TourContext.Provider>
  );
}

// ── Overlay ───────────────────────────────────────────────
function TourOverlay({
  phase,
  setPhase,
  measure,
}: {
  phase: Phase;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
  measure: (key: TourTargetKey) => Promise<Rectangle | null>;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();
  const isRTL = I18nManager.isRTL;

  const steps = STEP_DEFS;
  const [stepIndex, setStepIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const tipWidth = Math.min(SW - 24, 360);
  const [tipHeight, setTipHeight] = useState(0);

  const reduceMotion = useRef(false);
  const revealed = useRef(false);
  // The overlay's own window position. measureInWindow gives window coords, but
  // this absolute-fill View may not start at window (0,0) (e.g. its container is
  // pushed below the status bar). We subtract this offset from target coords so
  // the spotlight lands exactly on the real element.
  const rootRef = useRef<View>(null);
  const rootOffset = useRef({ x: 0, y: 0 });

  // Animated values (SVG props can't use the native driver → useNativeDriver:false)
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const spotX = useRef(new Animated.Value(0)).current;
  const spotY = useRef(new Animated.Value(0)).current;
  const spotW = useRef(new Animated.Value(0)).current;
  const spotH = useRef(new Animated.Value(0)).current;
  const spotR = useRef(new Animated.Value(0)).current;
  const tipTop = useRef(new Animated.Value(0)).current;
  const tipLeft = useRef(new Animated.Value(0)).current;
  const tipOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) reduceMotion.current = v;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      reduceMotion.current = v;
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const close = useCallback(() => {
    Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => {
      revealed.current = false;
      setBox(null);
      setStepIndex(0);
      tipOpacity.setValue(0);
      setPhase('idle');
    });
  }, [overlayOpacity, tipOpacity, setPhase]);

  const computeBox = useCallback((rect: Rectangle, shape: Shape): Box => {
    if (shape === 'circle') {
      const d = Math.max(rect.width, rect.height) + 16;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      return { x: cx - d / 2, y: cy - d / 2, w: d, h: d, r: d / 2 };
    }
    const pad = 10;
    return { x: rect.x - pad, y: rect.y - pad, w: rect.width + pad * 2, h: rect.height + pad * 2, r: 14 };
  }, []);

  // Window position of the overlay itself (0,0 when it fills from the window top).
  const measureRoot = useCallback(
    () =>
      new Promise<{ x: number; y: number }>((resolve) => {
        const node = rootRef.current;
        if (!node || typeof node.measureInWindow !== 'function') return resolve(rootOffset.current);
        node.measureInWindow((x, y) => {
          const off = { x: x || 0, y: y || 0 };
          rootOffset.current = off;
          resolve(off);
        });
      }),
    [],
  );

  // Move the spotlight to a step (skips targets that aren't mounted/measurable).
  const applyStep = useCallback(
    async (fromIndex: number, animate: boolean) => {
      const off = await measureRoot();
      let i = fromIndex;
      let rect: Rectangle | null = null;
      while (i < steps.length) {
        rect = await measure(steps[i].key);
        if (rect) break;
        i += 1;
      }
      if (!rect || i >= steps.length) {
        close();
        return;
      }
      // Convert window coords → overlay-local coords.
      const local: Rectangle = {
        x: rect.x - off.x,
        y: rect.y - off.y,
        width: rect.width,
        height: rect.height,
      };
      setStepIndex(i);
      const nb = computeBox(local, steps[i].shape);
      setBox(nb);
      const duration = animate && !reduceMotion.current ? 350 : 0;
      const easing = Easing.out(Easing.cubic);
      Animated.parallel([
        Animated.timing(spotX, { toValue: nb.x, duration, easing, useNativeDriver: false }),
        Animated.timing(spotY, { toValue: nb.y, duration, easing, useNativeDriver: false }),
        Animated.timing(spotW, { toValue: nb.w, duration, easing, useNativeDriver: false }),
        Animated.timing(spotH, { toValue: nb.h, duration, easing, useNativeDriver: false }),
        Animated.timing(spotR, { toValue: nb.r, duration, easing, useNativeDriver: false }),
      ]).start();
    },
    [steps, measure, close, computeBox, measureRoot, spotX, spotY, spotW, spotH, spotR],
  );

  // Fade the overlay in per phase; kick off the first step.
  useEffect(() => {
    if (phase === 'intro') {
      overlayOpacity.setValue(0);
      Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: false }).start();
    } else if (phase === 'steps') {
      overlayOpacity.setValue(1);
      tipOpacity.setValue(0);
      revealed.current = false;
      applyStep(0, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Position the tooltip within screen bounds (above/below the spotlight).
  // Bounds are expressed in overlay-local coords (subtract the overlay offset).
  useEffect(() => {
    if (phase !== 'steps' || !box || !tipHeight) return;
    const off = rootOffset.current;
    const gap = 14;
    const topSafe = insets.top + 12 - off.y;
    const bottomSafe = SH - insets.bottom - 12 - off.y;
    const spaceBelow = bottomSafe - (box.y + box.h + gap);
    const below = spaceBelow >= tipHeight;
    const top = below
      ? box.y + box.h + gap
      : Math.max(topSafe, box.y - gap - tipHeight);
    const left = Math.max(12 - off.x, Math.min(box.x + box.w / 2 - tipWidth / 2, SW - tipWidth - 12 - off.x));

    const duration = revealed.current && !reduceMotion.current ? 300 : 0;
    const easing = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(tipTop, { toValue: top, duration, easing, useNativeDriver: false }),
      Animated.timing(tipLeft, { toValue: left, duration, easing, useNativeDriver: false }),
    ]).start();
    if (!revealed.current) {
      revealed.current = true;
      // JS-driven (not native): the tooltip view also animates top/left, and a
      // single Animated view must not mix native + JS driven props.
      Animated.timing(tipOpacity, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    }
  }, [phase, box, tipHeight, tipWidth, SW, SH, insets.bottom, insets.top, tipTop, tipLeft, tipOpacity]);

  const beginSteps = useCallback(() => setPhase('steps'), [setPhase]);

  // Android hardware back closes the tour (replaces Modal.onRequestClose).
  useEffect(() => {
    if (phase === 'idle') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [phase, close]);

  const isLast = stepIndex >= steps.length - 1;
  const onNext = useCallback(() => {
    if (isLast) close();
    else applyStep(stepIndex + 1, true);
  }, [isLast, close, applyStep, stepIndex]);

  const spotProps = {
    x: spotX,
    y: spotY,
    width: spotW,
    height: spotH,
    rx: spotR,
    ry: spotR,
  } as unknown as { [k: string]: unknown };

  const step = steps[stepIndex];

  if (phase === 'idle') return null;

  return (
    <View ref={rootRef} style={styles.root} pointerEvents="auto">
      {phase === 'intro' ? (
        <Animated.View style={[styles.introOverlay, { opacity: overlayOpacity }]}>
          <View style={[styles.introCard, { backgroundColor: theme.bgCard }]}>
            <LinearGradient
              colors={[...brandGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.introIcon}
            >
              <ShieldCheck size={30} color="#fff" strokeWidth={1.8} />
            </LinearGradient>
            <Text style={[styles.introTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
              {t('tour.introTitle')}
            </Text>
            <Text style={[styles.introText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.5}>
              {t('tour.introText')}
            </Text>
            <TouchableOpacity
              onPress={beginSteps}
              activeOpacity={0.9}
              style={styles.introBtnWrap}
              accessibilityRole="button"
              accessibilityLabel={t('tour.start')}
            >
              <LinearGradient
                colors={[...brandGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.introBtn}
              >
                <Text style={styles.introBtnText} maxFontSizeMultiplier={1.3}>
                  {t('tour.start')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={close}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('tour.skipIntro')}
            >
              <Text style={[styles.introSkip, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                {t('tour.skipIntro')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : phase === 'steps' ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
          {box && (
            <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <Mask id="tourMask">
                  <Rect x={0} y={0} width={SW} height={SH} fill="#fff" />
                  <AnimatedRect {...spotProps} fill="#000" />
                </Mask>
              </Defs>
              <Rect x={0} y={0} width={SW} height={SH} fill={OVERLAY_STEPS} mask="url(#tourMask)" />
              <AnimatedRect
                {...spotProps}
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2}
              />
            </Svg>
          )}

          <Animated.View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h && Math.abs(h - tipHeight) > 1) setTipHeight(h);
            }}
            style={[
              styles.tip,
              {
                backgroundColor: theme.bgCard,
                width: tipWidth,
                top: tipTop,
                left: tipLeft,
                opacity: tipOpacity,
              },
            ]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${t('tour.stepOf', { current: stepIndex + 1, total: steps.length })}. ${t(step.titleKey)}. ${t(step.textKey)}`}
          >
            <View style={[styles.tipBadge, { backgroundColor: 'rgba(124,58,237,0.12)' }]}>
              <Text style={[styles.tipBadgeText, { color: palette.violet }]} maxFontSizeMultiplier={1.3}>
                {t('tour.stepOf', { current: stepIndex + 1, total: steps.length })}
              </Text>
            </View>
            <Text
              style={[styles.tipTitle, { color: theme.text, textAlign: isRTL ? 'right' : 'left' }]}
              maxFontSizeMultiplier={1.3}
            >
              {t(step.titleKey)}
            </Text>
            <Text
              style={[styles.tipText, { color: theme.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
              maxFontSizeMultiplier={1.5}
            >
              {t(step.textKey)}
            </Text>

            <View style={[styles.tipFooter, isRTL && styles.rowReverse]}>
              <View style={[styles.dots, isRTL && styles.rowReverse]}>
                {steps.map((s, i) => (
                  <View
                    key={s.key}
                    style={[
                      styles.dot,
                      { backgroundColor: i === stepIndex ? palette.violet : theme.borderLight },
                      i === stepIndex && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
              <View style={[styles.tipActions, isRTL && styles.rowReverse]}>
                <TouchableOpacity
                  onPress={close}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('tour.skip')}
                >
                  <Text style={[styles.tipSkip, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                    {t('tour.skip')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onNext}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={isLast ? t('tour.finish') : t('tour.next')}
                >
                  <LinearGradient
                    colors={[...brandGradient]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.tipNext}
                  >
                    <Text style={styles.tipNextText} maxFontSizeMultiplier={1.3}>
                      {isLast ? t('tour.finish') : t('tour.next')}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  // Intro card
  introOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11,15,20,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  introCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 16,
  },
  introIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  introBtnWrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 6,
  },
  introBtn: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  introSkip: {
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 10,
  },

  // Tooltip
  tip: {
    position: 'absolute',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 14,
  },
  tipBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  tipBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tipTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 14,
  },
  tipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    borderRadius: 3,
  },
  tipActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tipSkip: {
    fontSize: 13,
    fontWeight: '600',
  },
  tipNext: {
    height: 38,
    minWidth: 96,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipNextText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
