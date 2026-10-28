import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { palette } from '@/contexts/ThemeContext';
import { haptic, HapticStyle } from '@/utils/haptics';
import { KHATAM_INNER, easeOutBack, khatamPath, zelligePath } from '@/utils/khatam';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Same logo, width and backgrounds as the native splash (expo-splash-screen in
// app.config.js): the first frame matches it, so the hand-off is invisible.
const LOGO = require('@/assets/images/jitpluslogo.png');
const LOGO_W = 220;
const LOGO_H = (LOGO_W * 808) / 1024;
const BG_LIGHT = palette.white;
const BG_DARK = palette.gray900;

const SEAL_R = 130;
const RING_R = 165;
const STAR_R = 17;
const STAR_COUNT = 8;
const ZELLIGE_TILE = 72;
const ZELLIGE_R = 24;

// Timeline (ms after the logo is on screen).
const LIFT_MS = 170;
const PRESS_MS = 80;
const IMPACT_AT = LIFT_MS + PRESS_MS;
const STARS_AT = 370;
const STAR_STAGGER = 65;
const STAR_MS = 280;
const STARS_MS = (STAR_COUNT - 1) * STAR_STAGGER + STAR_MS;
const PULSE_AT = 850;
/** Earliest moment the app may open: the eighth star is in place. */
const SEQUENCE_MS = 1050;
const EXIT_MS = 400;
/** The logo usually loads in a frame; never keep the native splash longer than this. */
const LOGO_TIMEOUT_MS = 800;

const outCubic = Easing.out(Easing.cubic);
const inCubic = Easing.in(Easing.cubic);
const SPRING = { damping: 9, stiffness: 180 };

interface LaunchSplashProps {
  /** True once the app underneath can be shown (session restored). */
  ready: boolean;
  /** Called when the opening is over; the parent unmounts the splash. */
  onFinish: () => void;
}

/**
 * Animated launch: the logo is pressed like a seal (tabaa), leaves a khatam
 * imprint, a zellige appears, eight gold stars fill like a loyalty card, then
 * the app opens through a growing khatam. Takes over from the native splash.
 */
export default function LaunchSplash({ ready, onFinish }: LaunchSplashProps) {
  const reduceMotion = useReducedMotion();
  const dark = useColorScheme() === 'dark';
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height / 2;
  const ringR = Math.min(RING_R, cx - STAR_R - 8);
  const openR = Math.hypot(cx, cy) / KHATAM_INNER + 4;
  const bg = dark ? BG_DARK : BG_LIGHT;

  const scale = useSharedValue(1);
  const squash = useSharedValue(0);
  const ink = useSharedValue(0);
  const zellige = useSharedValue(0);
  const ringIn = useSharedValue(0);
  const stars = useSharedValue(0);
  const pulse = useSharedValue(0);
  const exit = useSharedValue(0);

  const started = useRef(false);
  const sequenceDone = useRef(false);
  const exiting = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Latest props behind refs keep the callbacks below stable, so a parent
  // re-render can never cancel the pending timers mid-sequence.
  const readyRef = useRef(ready);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    readyRef.current = ready;
    onFinishRef.current = onFinish;
  });

  const zelligeD = useMemo(() => zelligePath(width, height, ZELLIGE_TILE, ZELLIGE_R), [width, height]);

  const finish = useCallback(() => onFinishRef.current(), []);

  const open = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    exit.set(withTiming(
      1,
      { duration: reduceMotion ? 250 : EXIT_MS, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finish)();
      },
    ));
  }, [exit, finish, reduceMotion]);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => {});
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    const endSequence = () => {
      sequenceDone.current = true;
      if (readyRef.current) open();
    };

    if (reduceMotion) {
      ink.set(1);
      zellige.set(1);
      ringIn.set(1);
      stars.set(STARS_MS);
      endSequence();
      return;
    }
    scale.set(withSequence(
      withTiming(1.1, { duration: LIFT_MS, easing: outCubic }),
      withTiming(0.93, { duration: PRESS_MS, easing: inCubic }),
      withSpring(1, SPRING),
    ));
    squash.set(withDelay(
      LIFT_MS,
      withSequence(withTiming(1, { duration: PRESS_MS, easing: inCubic }), withSpring(0, SPRING)),
    ));
    ink.set(withDelay(IMPACT_AT, withTiming(1, { duration: 180, easing: outCubic })));
    ringIn.set(withDelay(IMPACT_AT + 20, withTiming(1, { duration: 180 })));
    zellige.set(withDelay(IMPACT_AT + 60, withTiming(1, { duration: 390 })));
    stars.set(withDelay(STARS_AT, withTiming(STARS_MS, { duration: STARS_MS, easing: Easing.linear })));
    pulse.set(withDelay(PULSE_AT, withTiming(1, { duration: 200 })));
    later(() => haptic(HapticStyle.Medium), IMPACT_AT);
    later(endSequence, SEQUENCE_MS);
  }, [reduceMotion, open, scale, squash, ink, ringIn, zellige, stars, pulse]);

  useEffect(() => {
    const fallback = setTimeout(start, LOGO_TIMEOUT_MS);
    const pending = timers.current;
    return () => {
      clearTimeout(fallback);
      pending.forEach(clearTimeout);
    };
  }, [start]); // start is stable: this runs once, on mount

  useEffect(() => {
    if (ready && sequenceDone.current) open();
  }, [ready, open]);

  // Background with a khatam-shaped hole that grows over the app.
  const bgProps = useAnimatedProps(() => {
    const r = exit.value * openR;
    const hole = r > 0 && !reduceMotion ? ` ${khatamPath(cx, cy, r, 22.5 * exit.value)}` : '';
    return { d: `M0 0 H${width} V${height} H0 Z${hole}` };
  });
  const edgeProps = useAnimatedProps(() => ({
    d: khatamPath(cx, cy, Math.max(exit.value * openR, 0.01), 22.5 * exit.value),
    strokeOpacity: reduceMotion || exit.value === 0 ? 0 : 1 - exit.value,
  }));

  const rootStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? 1 - exit.value : 1 }));
  // The stamp leaves a little ahead of the opening.
  const groupStyle = useAnimatedStyle(() => {
    const p = inCubic(Math.min(1, (exit.value * EXIT_MS) / 350));
    return { opacity: 1 - p, transform: [{ scale: 1 + 0.1 * p }] };
  });
  const zelligeStyle = useAnimatedStyle(() => ({
    opacity: zellige.value * (1 - Math.min(1, exit.value * 2.5)),
  }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: scale.value * (1 + 0.03 * squash.value) },
      { scaleY: scale.value * (1 - 0.08 * squash.value) },
    ],
  }));
  const sealStyle = useAnimatedStyle(() => ({
    opacity: ink.value,
    transform: [
      { scale: interpolate(ink.value, [0, 1], [0.7, 1]) },
      { rotate: `${22.5 * (1 - ink.value)}deg` },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.06 * Math.sin(Math.PI * pulse.value) }],
  }));
  const ringOutlineStyle = useAnimatedStyle(() => ({ opacity: ringIn.value }));

  const line = dark ? 'rgba(167,139,250,0.4)' : 'rgba(124,58,237,0.28)';
  const starCentres = useMemo(
    () => Array.from({ length: STAR_COUNT }, (_, i) => {
      const a = ((-90 + i * 45) * Math.PI) / 180;
      return [cx + ringR * Math.cos(a), cy + ringR * Math.sin(a)] as const;
    }),
    [cx, cy, ringR],
  );
  const ringOutline = useMemo(
    () => [khatamPath(cx, cy, ringR, 22.5), ...starCentres.map(([x, y]) => khatamPath(x, y, STAR_R))],
    [cx, cy, ringR, starCentres],
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <AnimatedPath animatedProps={bgProps} fill={bg} fillRule="evenodd" />
        <AnimatedPath animatedProps={edgeProps} fill="none" stroke={palette.goldLight} strokeWidth={2.5} strokeLinejoin="round" />
      </Svg>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, zelligeStyle]}>
        <Svg width={width} height={height}>
          <Path
            d={zelligeD}
            fill="none"
            stroke={dark ? palette.violetLight : palette.violet}
            strokeOpacity={dark ? 0.07 : 0.06}
            strokeWidth={1}
          />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, groupStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, ringOutlineStyle]}>
            <Svg width={width} height={height}>
              <Path d={ringOutline[0]} fill="none" stroke={dark ? 'rgba(167,139,250,0.22)' : 'rgba(124,58,237,0.12)'} strokeWidth={1.5} />
              {ringOutline.slice(1).map((d, i) => (
                <Path key={i} d={d} fill={bg} stroke={line} strokeWidth={1.5} strokeLinejoin="round" />
              ))}
            </Svg>
          </Animated.View>
          {starCentres.map(([x, y], i) => (
            <GoldStar key={i} index={i} x={x} y={y} progress={stars} />
          ))}
        </Animated.View>

        <Animated.View style={[styles.seal, { left: cx - SEAL_R, top: cy - SEAL_R }, sealStyle]}>
          <Svg width={SEAL_R * 2} height={SEAL_R * 2}>
            <Path d={khatamPath(SEAL_R, SEAL_R, SEAL_R)} fill={dark ? 'rgba(124,58,237,0.22)' : '#F3EFFE'} />
            <Path
              d={`${khatamPath(SEAL_R, SEAL_R, SEAL_R * 0.86)} ${khatamPath(SEAL_R, SEAL_R, SEAL_R * 0.86, 22.5)}`}
              fill="none"
              stroke={dark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.22)'}
              strokeWidth={1.5}
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.logo, { left: cx - LOGO_W / 2, top: cy - LOGO_H / 2 }, logoStyle]}>
          <Image source={LOGO} style={styles.logoImage} fadeDuration={0} onLoad={start} onError={start} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const STAR_SIZE = STAR_R * 2;
const STAR_D = khatamPath(STAR_R, STAR_R, STAR_R);

/** One of the eight loyalty stars: pops in gold, in turn. */
function GoldStar({ index, x, y, progress }: { index: number; x: number; y: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (progress.value - index * STAR_STAGGER) / STAR_MS));
    return {
      opacity: p > 0 ? 1 : 0,
      transform: [{ scale: easeOutBack(p) }, { rotate: `${45 * (1 - p)}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.star, { left: x - STAR_R, top: y - STAR_R }, style]}>
      <Svg width={STAR_SIZE} height={STAR_SIZE}>
        <Defs>
          <LinearGradient id={`launchGold${index}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.goldLight} />
            <Stop offset="1" stopColor={palette.gold} />
          </LinearGradient>
        </Defs>
        <Path d={STAR_D} fill={`url(#launchGold${index})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000 },
  seal: { position: 'absolute', width: SEAL_R * 2, height: SEAL_R * 2 },
  logo: { position: 'absolute', width: LOGO_W, height: LOGO_H, transformOrigin: 'bottom' },
  logoImage: { width: LOGO_W, height: LOGO_H },
  star: { position: 'absolute', width: STAR_SIZE, height: STAR_SIZE },
});
