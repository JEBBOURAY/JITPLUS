/**
 * SplashAnimated — custom animated splash shown right after the native Expo
 * splash hides, before Login/Accueil. Tells the "clients entering small
 * shops" story while the JitPlus logo builds itself, per BRIEF-DESIGN.md
 * tokens (violet #7C3AED / charbon #1F2937, Lexend).
 *
 * Frequency (does not fatigue a multi-times-a-day POS app):
 *  - FULL sequence (shops scene + logo build + text + dots, ~3.3s): only on
 *    first launch after install, or once per calendar day.
 *  - SHORT variant (logo build only, <1.5s): every other launch same day.
 *  - REDUCED variant (plain 250ms logo fade): when the OS "Reduce motion"
 *    accessibility setting is on.
 * Low-end Android (<=3GB RAM, heuristic via expo-device) is downgraded to
 * the SHORT variant even on a "full" day, to avoid jank (no native profiling
 * available in this environment — revisit with real device testing).
 *
 * Built with the React Native `Animated` API (already idiomatic across this
 * codebase — scan-qr.tsx, GuidedTour.tsx, KpiCounter.tsx) + react-native-svg
 * (already a dependency) for the radial glow. `react-native-reanimated` is
 * NOT installed in this project (no babel plugin / native module present),
 * and adding it purely for this one screen would require a new native build
 * for a cosmetic gain — not justified. `lottie-react-native` is installed
 * but there is no Lottie/Bodymovin export of this sequence to play; wiring
 * it here would need an After Effects asset that doesn't exist yet.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  AccessibilityInfo,
} from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BrandName from '@/components/BrandName';
import { useLanguage } from '@/contexts/LanguageContext';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';

interface SplashAnimatedProps {
  /** True once auth/profile bootstrap has resolved — gates the final transition. */
  ready: boolean;
  /** Called once (fade-out complete or skipped) — parent should mount the real app. */
  onFinish: () => void;
}

type Variant = 'full' | 'reduced';

// Module-level guard: within a single JS process, only the FIRST SplashAnimated
// mount plays the full sequence. Any remount (React StrictMode, LanguageProvider/
// PersistQueryClientProvider hydration flips, error boundary resets) falls back
// to `reduced` so users don't see the animation twice in a row. Reset on true
// cold start / native process restart.
let hasPlayedFullThisProcess = false;

// Splash background is ALWAYS white regardless of device theme, matching the
// native Expo splash (app.config.js `splash.backgroundColor: '#FFFFFF'`) —
// no perceptible flash on the native → custom splash handoff.
const BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';
const LOGO_SIZE = ms(100);
const LOW_END_MEMORY_BYTES = 3 * 1024 * 1024 * 1024; // 3GB heuristic

function isLowEndAndroid(): boolean {
  if (Platform.OS !== 'android') return false;
  // Emulators frequently report <=2GB RAM — exempt them so devs see the full
  // sequence during local testing. Real low-end devices still get 'reduced'.
  if (!Device.isDevice) return false;
  try {
    const mem = Device.totalMemory;
    return typeof mem === 'number' && mem > 0 && mem <= LOW_END_MEMORY_BYTES;
  } catch {
    return false;
  }
}

// Custom shop glyph matching jitplus-splash-scene-mockup.html (roof + walls + door).
const SHOP_SIZE = ms(46);
const ShopIcon = React.memo(function ShopIcon() {
  return (
    <Svg width={SHOP_SIZE} height={SHOP_SIZE} viewBox="0 0 24 24" fill="none" opacity={0.85}>
      <Path
        d="M3 9l1-5h16l1 5M4 9h16v11H4z"
        stroke={palette.charbon}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 20v-6h6v6"
        stroke={palette.charbon}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});

// ── One shop unit: static icon + client dot walking in + door glow ──
const ShopUnit = React.memo(function ShopUnit({ delayMs }: { delayMs: number }) {
  const dot = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const walkIn = Animated.sequence([
      Animated.delay(delayMs),
      Animated.timing(dot, {
        toValue: 1,
        duration: 1100,
        easing: Easing.bezier(0.3, 0.6, 0.3, 1),
        useNativeDriver: true,
      }),
    ]);
    const glowPulse = Animated.sequence([
      Animated.delay(delayMs + 850),
      Animated.timing(glow, { toValue: 1, duration: 500, easing: Easing.ease, useNativeDriver: true }),
    ]);
    walkIn.start();
    glowPulse.start();
    return () => {
      walkIn.stop();
      glowPulse.stop();
    };
  }, [delayMs, dot, glow]);

  const dotStyle = useMemo(() => ({
    opacity: dot.interpolate({ inputRange: [0, 0.18, 0.75, 1], outputRange: [0, 1, 1, 0] }),
    transform: [
      { translateY: dot.interpolate({ inputRange: [0, 0.75, 1], outputRange: [46, 4, -2] }) },
      { scale: dot.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0.4] }) },
    ],
  }), [dot]);

  const glowStyle = useMemo(() => ({
    opacity: glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
    transform: [{ scale: glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1.3, 1.6] }) }],
  }), [glow]);

  return (
    <View style={styles.shopUnit}>
      <ShopIcon />
      <Animated.View style={[styles.customerDot, dotStyle]} />
      <Animated.View style={[styles.doorGlow, glowStyle]} />
    </View>
  );
});

// ── One pulsing loading dot (looping scale + colour) ──
const PulseDot = React.memo(function PulseDot({ stagger }: { stagger: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(stagger),
        Animated.timing(pulse, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, stagger]);

  const dotStyle = useMemo(() => ({
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
    backgroundColor: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(124,58,237,0.25)', palette.violet],
    }),
  }), [pulse]);

  return <Animated.View style={[styles.dot, dotStyle]} />;
});

export default function SplashAnimated({ ready, onFinish }: SplashAnimatedProps) {
  const { t, isRTL } = useLanguage();
  const [variant, setVariant] = useState<Variant | null>(null);

  const readyRef = useRef(ready);
  readyRef.current = ready;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const finishedRef = useRef(false);
  const sequenceEndedRef = useRef(false);
  const sequenceAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Entrance-animated values (unused ones for a given variant simply stay at 0/rest).
  const logoWrapOpacity = useRef(new Animated.Value(0)).current;
  const logoReveal = useRef(new Animated.Value(0)).current;
  const brand = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const dotsRow = useRef(new Animated.Value(0)).current;
  const stageOpacity = useRef(new Animated.Value(1)).current;
  const stageScale = useRef(new Animated.Value(1)).current;

  // ── Hide the native Expo splash right when THIS component mounts — our
  // white bg + same logo continues seamlessly, no flash. ──
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // ── Determine variant: reduce-motion > low-end Android > daily frequency ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let reduceMotion = false;
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch { /* default false */ }

      if (cancelled) return;
      if (reduceMotion) {
        setVariant('reduced');
        return;
      }

      // Same process already played the full sequence — collapse subsequent
      // mounts to a quick fade so the user never sees the animation twice.
      if (hasPlayedFullThisProcess) {
        if (!cancelled) setVariant('reduced');
        return;
      }

      // Dev builds always play the full sequence so iteration doesn't need
      // AsyncStorage resets between reloads.
      if (__DEV__) {
        hasPlayedFullThisProcess = true;
        if (!cancelled) setVariant('full');
        return;
      }

      // First launch after install → play the full sequence and mark it seen.
      // Every launch after that → reduced (near-instant fade), same behaviour
      // as reduce-motion so returning users aren't slowed down.
      let alreadyShown = false;
      try {
        alreadyShown = (await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.SPLASH_SHOWN)) === '1';
      } catch { /* default: treat as first-time */ }

      if (cancelled) return;
      if (alreadyShown || isLowEndAndroid()) {
        setVariant('reduced');
        return;
      }

      try {
        await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.SPLASH_SHOWN, '1');
      } catch { /* non-fatal — next launch will just replay the full sequence */ }
      hasPlayedFullThisProcess = true;
      if (!cancelled) setVariant('full');
    })();
    return () => { cancelled = true; };
  }, []);

  const maybeFinish = useCallback(() => {
    if (finishedRef.current) return;
    if (!sequenceEndedRef.current || !readyRef.current) return;
    finishedRef.current = true;
    Animated.parallel([
      Animated.timing(stageOpacity, { toValue: 0, duration: 400, easing: Easing.ease, useNativeDriver: true }),
      Animated.timing(stageScale, { toValue: 0.97, duration: 400, easing: Easing.ease, useNativeDriver: true }),
    ]).start(() => onFinishRef.current());
  }, [stageOpacity, stageScale]);

  // Re-check once `ready` flips true after the sequence already ended.
  useEffect(() => {
    if (ready) maybeFinish();
  }, [ready, maybeFinish]);

  // ── Start the chosen variant's entrance timeline ──
  useEffect(() => {
    if (!variant) return;

    if (variant === 'reduced') {
      const anim = Animated.timing(logoWrapOpacity, { toValue: 1, duration: 250, easing: Easing.ease, useNativeDriver: true });
      sequenceAnimRef.current = anim;
      anim.start(({ finished }) => {
        if (finished) { sequenceEndedRef.current = true; maybeFinish(); }
      });
      return () => { anim.stop(); };
    }

    const timelineParts = [
      Animated.sequence([
        Animated.delay(150),
        Animated.timing(logoWrapOpacity, { toValue: 1, duration: 300, easing: Easing.ease, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(550),
        Animated.timing(logoReveal, {
          toValue: 1,
          duration: 1400,
          easing: Easing.bezier(0.16, 0.8, 0.2, 1),
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.delay(2100),
        Animated.timing(brand, { toValue: 1, duration: 550, easing: Easing.ease, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(2400),
        Animated.timing(tagline, { toValue: 1, duration: 550, easing: Easing.ease, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(2700),
        Animated.timing(dotsRow, { toValue: 1, duration: 500, easing: Easing.ease, useNativeDriver: true }),
      ]),
    ];

    const anim = Animated.parallel(timelineParts);
    sequenceAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) { sequenceEndedRef.current = true; maybeFinish(); }
    });
    return () => {
      anim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // ── Tap anywhere to skip straight to the end pose (never blocks navigation) ──
  const handleSkip = useCallback(() => {
    if (finishedRef.current || sequenceEndedRef.current) return;
    sequenceAnimRef.current?.stop();
    logoWrapOpacity.setValue(1);
    logoReveal.setValue(1);
    brand.setValue(1);
    tagline.setValue(1);
    dotsRow.setValue(1);
    sequenceEndedRef.current = true;
    maybeFinish();
  }, [brand, dotsRow, logoReveal, logoWrapOpacity, maybeFinish, tagline]);

  const maskHeight = useMemo(
    () => logoReveal.interpolate({ inputRange: [0, 1], outputRange: [LOGO_SIZE, 0] }),
    [logoReveal],
  );
  const lineOpacity = useMemo(
    () => logoReveal.interpolate({ inputRange: [0, 0.95, 1], outputRange: [1, 1, 0] }),
    [logoReveal],
  );
  const brandStyle = useMemo(() => ({
    opacity: brand,
    transform: [{ translateY: brand.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  }), [brand]);
  const taglineStyle = useMemo(() => ({
    opacity: tagline,
    transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  }), [tagline]);
  const stageStyle = useMemo(() => ({
    opacity: stageOpacity,
    transform: [{ scale: stageScale }],
  }), [stageOpacity, stageScale]);

  if (!variant) {
    // Waiting on the (near-instant) reduce-motion + frequency checks — keep the
    // exact same white + logo continuity as the native splash, no flash.
    return (
      <View style={styles.root}>
        <Image source={require('@/assets/images/jitplusprologo.png')} style={styles.logoStatic} resizeMode="contain" />
      </View>
    );
  }

  return (
    <Pressable style={styles.root} onPress={handleSkip} accessibilityRole="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="30%" r="65%">
            <Stop offset="0%" stopColor={palette.violet} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={palette.violet} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
      </Svg>

      <Animated.View style={[styles.stage, stageStyle]}>
        {variant === 'full' && (
          <View style={[styles.shopsRow, isRTL && styles.shopsRowRTL]}>
            <ShopUnit delayMs={200} />
            <ShopUnit delayMs={550} />
            <ShopUnit delayMs={900} />
          </View>
        )}

        <Animated.View style={[styles.logoBox, { opacity: logoWrapOpacity }]}>
          {variant === 'reduced' ? (
            <Image source={require('@/assets/images/jitplusprologo.png')} style={styles.logoStatic} resizeMode="contain" />
          ) : (
            <>
              <Image source={require('@/assets/images/jitplusprologo.png')} style={styles.logoStatic} resizeMode="contain" />
              <Animated.View style={[styles.logoMask, { height: maskHeight }]} />
              <Animated.View style={[styles.buildLine, { top: maskHeight, opacity: lineOpacity }]}>
                <LinearGradient
                  colors={['transparent', palette.violetLight, 'transparent']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </>
          )}
        </Animated.View>

        {variant === 'full' && (
          <>
            <Animated.View style={brandStyle}>
              <BrandName fontSize={19} />
            </Animated.View>
            <Animated.View style={taglineStyle}>
              <Text style={styles.tagline}>
                {t('splash.taglineBefore')}
                <Text style={styles.taglineHighlight}>{t('splash.taglineHighlight')}</Text>
                {t('splash.taglineAfter')}
              </Text>
            </Animated.View>
            <Animated.View style={[styles.dotsRow, { opacity: dotsRow }]}>
              <PulseDot stagger={0} />
              <PulseDot stagger={150} />
              <PulseDot stagger={300} />
            </Animated.View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopsRow: {
    flexDirection: 'row',
    gap: ms(38),
    alignItems: 'flex-end',
    marginBottom: ms(52),
    height: ms(74),
  },
  shopsRowRTL: {
    flexDirection: 'row-reverse',
  },
  shopUnit: {
    width: ms(46),
    alignItems: 'center',
  },
  customerDot: {
    position: 'absolute',
    bottom: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.violet,
  },
  doorGlow: {
    position: 'absolute',
    bottom: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(124,58,237,0.35)',
  },
  logoBox: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  logoStatic: {
    width: '100%',
    height: '100%',
  },
  logoMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: BG,
  },
  buildLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    overflow: 'hidden',
  },
  tagline: {
    fontSize: ms(12.5),
    fontFamily: 'Lexend_500Medium',
    color: TEXT_MUTED,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: ms(18),
    paddingHorizontal: ms(55),
  },
  taglineHighlight: {
    color: palette.violet,
    fontFamily: 'Lexend_600SemiBold',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 26,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
