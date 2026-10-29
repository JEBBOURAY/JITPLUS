// Takes over from the native splash with the same logo, size and background so the
// handoff is invisible, then fades the logo out once the auth bootstrap is ready.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useColorScheme, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

interface SplashAnimatedProps {
  /** True once auth/profile bootstrap has resolved — gates the final transition. */
  ready: boolean;
  /** Called once, when the exit animation completes — parent should mount the real app. */
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

const EXIT_MS = 300;
const EXIT_MS_REDUCED = 200;

export default function SplashAnimated({ ready, onFinish }: SplashAnimatedProps) {
  const isDark = useColorScheme() === 'dark';
  const onFinishRef = useRef(onFinish);
  const finishedRef = useRef(false);
  const reduceMotionRef = useRef(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Fallback in case onLoadEnd never fires: the native splash must never stay up.
  useEffect(() => {
    const timer = setTimeout(hideNativeSplash, 500);
    return () => clearTimeout(timer);
  }, [hideNativeSplash]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (!cancelled) reduceMotionRef.current = enabled; })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || finishedRef.current) return;
    finishedRef.current = true;
    hideNativeSplash();
    const reduced = reduceMotionRef.current;
    const duration = reduced ? EXIT_MS_REDUCED : EXIT_MS;
    const easing = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration, easing, useNativeDriver: true }),
      Animated.timing(scale, { toValue: reduced ? 1 : 0.96, duration, easing, useNativeDriver: true }),
    ]).start(() => onFinishRef.current());
  }, [ready, hideNativeSplash, opacity, scale]);

  return (
    <View style={[styles.root, { backgroundColor: isDark ? BG_DARK : BG_LIGHT }]}>
      <Animated.Image
        source={isDark ? LOGO_DARK : LOGO_LIGHT}
        style={[styles.logo, { opacity, transform: [{ scale }] }]}
        resizeMode="contain"
        // Hide the native splash only once the logo is decoded, otherwise a blank frame shows.
        onLoadEnd={hideNativeSplash}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
