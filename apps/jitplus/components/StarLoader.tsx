import { memo, useEffect, useMemo } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { easeOutBack, khatamPath } from '@/utils/khatam';

const LOGO = require('@/assets/images/jitpluslogo.png');
const LOGO_RATIO = 808 / 1024;

// Proportions of the 104 px reference drawing; everything scales with `size`.
const REF = 104;
const LOGO_W = 52;
const RING_R = 44;
const STAR_R = 6.5;
const SEAL_R = 34;

const CYCLE_MS = 1500;
const STAR_STAGGER = 140;
const STAR_MS = 300;
const FADE_AT = 1300;
const ROSETTE_MS = 6000;

interface StarLoaderProps {
  /** Overall diameter. */
  size?: number;
  /** Surface the loader sits on; defaults to the app theme. */
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}

/** Brand loader: on a khatam seal, eight gold stars fill around the logo like a loyalty card, then start again. */
export default memo(function StarLoader({ size = 96, tone, style }: StarLoaderProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const dark = (tone ?? theme.mode) === 'dark';
  const k = size / REF;
  const c = size / 2;

  // With reduced motion the loader stays still, every star filled.
  const clock = useSharedValue(reduceMotion ? FADE_AT : 0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    clock.value = withRepeat(withTiming(CYCLE_MS, { duration: CYCLE_MS, easing: Easing.linear }), -1, false);
    spin.value = withRepeat(withTiming(45, { duration: ROSETTE_MS, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(clock);
      cancelAnimation(spin);
    };
  }, [reduceMotion, clock, spin]);

  const stars = useMemo(
    () => Array.from({ length: 8 }, (_, i) => {
      const a = ((-90 + i * 45) * Math.PI) / 180;
      return [c + RING_R * k * Math.cos(a), c + RING_R * k * Math.sin(a)] as const;
    }),
    [c, k],
  );
  const base = useMemo(() => ({
    seal: khatamPath(c, c, SEAL_R * k),
    slots: stars.map(([x, y]) => khatamPath(x, y, STAR_R * k)).join(' '),
  }), [c, k, stars]);
  const rosette = useMemo(() => khatamPath(c, c, RING_R * k, 22.5), [c, k]);

  const rosetteStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const logoW = LOGO_W * k;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
    >
      <Animated.View style={[StyleSheet.absoluteFill, rosetteStyle]}>
        <Svg width={size} height={size}>
          <Path d={rosette} fill="none" stroke={dark ? 'rgba(167,139,250,0.25)' : 'rgba(124,58,237,0.14)'} strokeWidth={1} />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Path d={base.seal} fill={dark ? 'rgba(124,58,237,0.2)' : '#F3EFFE'} />
        <Path
          d={base.slots}
          fill="none"
          stroke={dark ? 'rgba(167,139,250,0.45)' : '#E4DCFA'}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </Svg>
      {stars.map(([x, y], i) => (
        <LoaderStar key={i} index={i} x={x} y={y} r={STAR_R * k} clock={clock} />
      ))}
      <Image
        source={LOGO}
        fadeDuration={0}
        style={{ position: 'absolute', left: c - logoW / 2, top: c - (logoW * LOGO_RATIO) / 2, width: logoW, height: logoW * LOGO_RATIO }}
      />
    </View>
  );
});

function LoaderStar({ index, x, y, r, clock }: { index: number; x: number; y: number; r: number; clock: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (clock.value - index * STAR_STAGGER) / STAR_MS));
    const fade = 1 - Math.min(1, Math.max(0, (clock.value - FADE_AT) / (CYCLE_MS - FADE_AT)));
    return { transform: [{ scale: easeOutBack(p) * fade }, { rotate: `${45 * (1 - p)}deg` }] };
  });
  const d = useMemo(() => khatamPath(r, r, r), [r]);
  return (
    <Animated.View style={[{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2 }, style]}>
      <Svg width={r * 2} height={r * 2}>
        <Path d={d} fill={palette.gold} />
      </Svg>
    </Animated.View>
  );
}
