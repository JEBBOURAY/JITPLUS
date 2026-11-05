// Takes over from the native splash with the same logo, size and background so the
// handoff is invisible, then plays the "tabaa" opening: the logo is pressed like a
// seal, leaves a khatam imprint on a zellige, eight brass stars fill around it like a
// loyalty card, and the screen opens on a growing khatam once the app is ready.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { safeImpact } from '@/utils/haptics';
import { KHATAM_INNER, khatamPath, zelligePath } from '@/utils/khatam';

interface SplashAnimatedProps {
  /** True once auth/profile bootstrap has resolved — gates the final transition. */
  ready: boolean;
  /** Called once, when the exit animation starts — the app underneath starts showing. */
  onOpen?: () => void;
  /** Called once, when the exit animation completes — parent should unmount the splash. */
  onFinish: () => void;
}

// Mirror the expo-splash-screen plugin in app.config.js (imageWidth and the light/dark
// backgroundColor). The native splash follows the OS scheme, not the in-app theme
// preference, which is why this reads useColorScheme() rather than useTheme().
const LOGO_SIZE = 170;
const BG_LIGHT = '#FFFFFF';
const BG_DARK = '#0F172A';
const LOGO_LIGHT = require('@/assets/images/splash-logo.png');
const LOGO_DARK = require('@/assets/images/splash-logo-dark.png');

const SEAL_R = 118;
const RING_R = 150;
const STAR_R = 15;
const STAR_COUNT = 8;
const ZELLIGE_TILE = 72;
const ZELLIGE_R = 24;
const BRASS_LIGHT = '#E9C877';

// Timeline (ms after the logo is on screen).
const LIFT_MS = 170;
const PRESS_MS = 80;
const IMPACT_AT = LIFT_MS + PRESS_MS;
const STARS_AT = 370;
const STAR_STAGGER = 65;
const STAR_MS = 280;
const PULSE_AT = 850;
/** Earliest moment the app may open: the eighth star is in place. */
const SEQUENCE_MS = 1050;
const EXIT_MS = 420;
const EXIT_MS_REDUCED = 220;
/** The logo usually loads in a frame; never keep the native splash longer than this. */
const LOGO_TIMEOUT_MS = 800;

const outCubic = Easing.out(Easing.cubic);
const inCubic = Easing.in(Easing.cubic);
const SPRING = { damping: 9, stiffness: 180, useNativeDriver: true } as const;

export default function SplashAnimated({ ready, onOpen, onFinish }: SplashAnimatedProps) {
  const dark = useColorScheme() === 'dark';
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height / 2;
  const ringR = Math.min(RING_R, cx - STAR_R - 8);
  const openR = Math.hypot(cx, cy) / KHATAM_INNER + 4;
  const bg = dark ? BG_DARK : BG_LIGHT;

  const [v] = useState(() => ({
    scale: new Animated.Value(1),
    squash: new Animated.Value(0),
    ink: new Animated.Value(0),
    zellige: new Animated.Value(0),
    pulse: new Animated.Value(0),
    exit: new Animated.Value(0),
    stars: Array.from({ length: STAR_COUNT }, () => new Animated.Value(0)),
  }));

  const started = useRef(false);
  const sequenceDone = useRef(false);
  const exiting = useRef(false);
  const reduceMotion = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Latest props behind refs keep the callbacks below stable, so a parent
  // re-render can never cancel the pending timers mid-sequence.
  const readyRef = useRef(ready);
  const onOpenRef = useRef(onOpen);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    readyRef.current = ready;
    onOpenRef.current = onOpen;
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (!cancelled) reduceMotion.current = enabled; })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const open = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    onOpenRef.current?.();
    Animated.timing(v.exit, {
      toValue: 1,
      duration: reduceMotion.current ? EXIT_MS_REDUCED : EXIT_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onFinishRef.current());
  }, [v]);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => {});
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    const endSequence = () => {
      sequenceDone.current = true;
      if (readyRef.current) open();
    };

    if (reduceMotion.current) {
      v.ink.setValue(1);
      v.zellige.setValue(1);
      v.stars.forEach((s) => s.setValue(1));
      endSequence();
      return;
    }

    Animated.sequence([
      Animated.timing(v.scale, { toValue: 1.1, duration: LIFT_MS, easing: outCubic, useNativeDriver: true }),
      Animated.timing(v.scale, { toValue: 0.93, duration: PRESS_MS, easing: inCubic, useNativeDriver: true }),
      Animated.spring(v.scale, { toValue: 1, ...SPRING }),
    ]).start();
    Animated.sequence([
      Animated.delay(LIFT_MS),
      Animated.timing(v.squash, { toValue: 1, duration: PRESS_MS, easing: inCubic, useNativeDriver: true }),
      Animated.spring(v.squash, { toValue: 0, ...SPRING }),
    ]).start();
    Animated.sequence([
      Animated.delay(IMPACT_AT),
      Animated.timing(v.ink, { toValue: 1, duration: 180, easing: outCubic, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(IMPACT_AT + 60),
      Animated.timing(v.zellige, { toValue: 1, duration: 390, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(STARS_AT),
      Animated.stagger(STAR_STAGGER, v.stars.map((s) => Animated.timing(s, {
        toValue: 1, duration: STAR_MS, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true,
      }))),
    ]).start();
    Animated.sequence([
      Animated.delay(PULSE_AT),
      Animated.timing(v.pulse, { toValue: 1, duration: 100, easing: outCubic, useNativeDriver: true }),
      Animated.timing(v.pulse, { toValue: 0, duration: 120, easing: inCubic, useNativeDriver: true }),
    ]).start();
    later(() => safeImpact(Haptics.ImpactFeedbackStyle.Medium), IMPACT_AT);
    later(endSequence, SEQUENCE_MS);
  }, [v, open]);

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

  const zelligeD = useMemo(() => zelligePath(width, height, ZELLIGE_TILE, ZELLIGE_R), [width, height]);
  const starCentres = useMemo(
    () => Array.from({ length: STAR_COUNT }, (_, i) => {
      const a = ((-90 + i * 45) * Math.PI) / 180;
      return [cx + ringR * Math.cos(a), cy + ringR * Math.sin(a)] as const;
    }),
    [cx, cy, ringR],
  );
  const ring = useMemo(() => ({
    rosette: khatamPath(cx, cy, ringR, 22.5),
    slots: starCentres.map(([x, y]) => khatamPath(x, y, STAR_R)).join(' '),
  }), [cx, cy, ringR, starCentres]);
  const openEdge = useMemo(() => khatamPath(cx, cy, openR, 22.5), [cx, cy, openR]);

  const line = dark ? 'rgba(167,139,250,0.4)' : 'rgba(124,58,237,0.28)';
  const exitFast = v.exit.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 1, 1] });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        // The background fades last, behind the brass khatam, revealing the app mounted underneath.
        { backgroundColor: bg, opacity: v.exit.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1, 0] }) },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(v.zellige, exitFast.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })) }]}
      >
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

      {/* Stamp group: leaves a little ahead of the opening. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: exitFast.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ scale: exitFast.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
          },
        ]}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ scale: v.pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.ink }]}>
            <Svg width={width} height={height}>
              <Path d={ring.rosette} fill="none" stroke={dark ? 'rgba(167,139,250,0.22)' : 'rgba(124,58,237,0.12)'} strokeWidth={1.5} />
              <Path d={ring.slots} fill={bg} stroke={line} strokeWidth={1.5} strokeLinejoin="round" />
            </Svg>
          </Animated.View>
          {starCentres.map(([x, y], i) => (
            <BrassStar key={i} index={i} x={x} y={y} progress={v.stars[i]} />
          ))}
        </Animated.View>

        <Animated.View
          style={[
            styles.seal,
            {
              left: cx - SEAL_R,
              top: cy - SEAL_R,
              opacity: v.ink,
              transform: [
                { scale: v.ink.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                { rotate: v.ink.interpolate({ inputRange: [0, 1], outputRange: ['22.5deg', '0deg'] }) },
              ],
            },
          ]}
        >
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

        <Animated.Image
          source={dark ? LOGO_DARK : LOGO_LIGHT}
          resizeMode="contain"
          fadeDuration={0}
          // Start only once the logo is decoded, otherwise a blank frame shows after the native splash.
          onLoadEnd={start}
          accessibilityIgnoresInvertColors
          style={[
            styles.logo,
            {
              left: cx - LOGO_SIZE / 2,
              top: cy - LOGO_SIZE / 2,
              transform: [
                { scaleX: Animated.multiply(v.scale, v.squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] })) },
                { scaleY: Animated.multiply(v.scale, v.squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] })) },
              ],
            },
          ]}
        />
      </Animated.View>

      {/* Brass khatam edge opening outwards; drawn at full size so it ends crisp. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: v.exit.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 0] }),
            transform: [
              { scale: v.exit.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }) },
              { rotate: v.exit.interpolate({ inputRange: [0, 1], outputRange: ['-22.5deg', '0deg'] }) },
            ],
          },
        ]}
      >
        <Svg width={width} height={height}>
          <Path d={openEdge} fill="none" stroke={palette.gold} strokeWidth={3} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const STAR_SIZE = STAR_R * 2;
const STAR_D = khatamPath(STAR_R, STAR_R, STAR_R);

/** One of the eight loyalty stars: pops in brass, in turn. */
function BrassStar({ index, x, y, progress }: { index: number; x: number; y: number; progress: Animated.Value }) {
  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: x - STAR_R,
          top: y - STAR_R,
          opacity: progress.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: progress },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['45deg', '0deg'] }) },
          ],
        },
      ]}
    >
      <Svg width={STAR_SIZE} height={STAR_SIZE}>
        <Defs>
          <LinearGradient id={`proBrass${index}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRASS_LIGHT} />
            <Stop offset="1" stopColor={palette.goldDeep} />
          </LinearGradient>
        </Defs>
        <Path d={STAR_D} fill={`url(#proBrass${index})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000 },
  seal: { position: 'absolute', width: SEAL_R * 2, height: SEAL_R * 2 },
  logo: { position: 'absolute', width: LOGO_SIZE, height: LOGO_SIZE },
  star: { position: 'absolute', width: STAR_SIZE, height: STAR_SIZE },
});
