import { useEffect, useRef, useMemo } from 'react';
import { Animated, Easing, ViewStyle, AccessibilityInfo } from 'react-native';
import { hp } from '@/utils/responsive';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

interface FadeInViewProps {
  delay?: number;
  duration?: number;
  from?: 'bottom' | 'left' | 'right' | 'none';
  distance?: number;
  style?: ViewStyle;
  /** false = render in place at once (read on mount only), e.g. a list row seen before. */
  animate?: boolean;
  children: React.ReactNode;
}

export default function FadeInView({
  delay = 0,
  duration = 250,
  from = 'bottom',
  distance = hp(20),
  style,
  animate = true,
  children,
}: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const translate = useRef(new Animated.Value(animate ? distance : 0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    if (!animate) return;
    const run = (reduceMotion: boolean) => {
      if (cancelled) return;
      // "Reduce motion" is read before starting: show the content at once.
      if (reduceMotion) {
        opacity.setValue(1);
        translate.setValue(0);
        return;
      }
      animation = Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration, delay, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(translate, { toValue: 0, duration, delay, easing: EASE_OUT, useNativeDriver: true }),
      ]);
      animation.start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(run).catch(() => run(false));
    return () => { cancelled = true; animation?.stop(); };
  // Entrance animation: runs once with the props of the first render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transform = useMemo(() =>
    from === 'bottom'
      ? [{ translateY: translate }]
      : from === 'left'
      ? [{ translateX: Animated.multiply(translate, -1) }]
      : from === 'right'
      ? [{ translateX: translate }]
      : [],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [from]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
