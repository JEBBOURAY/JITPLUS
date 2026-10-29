import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, DimensionValue, Easing, View, ViewStyle, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

interface SkeletonProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const SWEEP_MS = 1500;
const BAND = 120;

// One sweep shared by every skeleton on screen: the light crosses them as a
// single band, and only one native animation runs however many blocks there are.
const sweep = new Animated.Value(0);
let sweepUsers = 0;
let sweepLoop: Animated.CompositeAnimation | null = null;

function acquireSweep() {
  sweepUsers += 1;
  if (sweepUsers > 1) return;
  sweep.setValue(0);
  sweepLoop = Animated.loop(
    Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.linear, useNativeDriver: true }),
  );
  sweepLoop.start();
}

function releaseSweep() {
  sweepUsers -= 1;
  if (sweepUsers > 0) return;
  sweepLoop?.stop();
  sweepLoop = null;
}

export default memo(function Skeleton({ width, height, borderRadius = 12, style }: SkeletonProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [pageX, setPageX] = useState<number | null>(null);

  useEffect(() => {
    if (reduceMotion) return;
    acquireSweep();
    return releaseSweep;
  }, [reduceMotion]);

  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((x) => setPageX(x));
  }, []);

  // The band travels across the window; each block shows the part passing over it.
  const translateX = useMemo(
    () => (pageX === null
      ? null
      : sweep.interpolate({ inputRange: [0, 1], outputRange: [-BAND - pageX, windowWidth - pageX] })),
    [pageX, windowWidth],
  );
  const highlight = theme.bgSkeletonHighlight;

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={reduceMotion ? undefined : onLayout}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        { width, height, borderRadius, backgroundColor: theme.bgSkeleton, overflow: 'hidden' },
        style,
      ]}
    >
      {translateX && (
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND, transform: [{ translateX }] }}>
          <LinearGradient
            colors={[`${highlight}00`, highlight, `${highlight}00`]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
});
