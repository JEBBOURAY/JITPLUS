import { memo, useEffect, useRef, useMemo } from 'react';
import { Animated, DimensionValue, ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface SkeletonProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default memo(function Skeleton({ width, height, borderRadius = 12, style }: SkeletonProps) {
  const theme = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedOpacity = useMemo(
    () => shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.bgSkeleton,
          opacity: animatedOpacity,
        },
        style,
      ]}
    />
  );
});
