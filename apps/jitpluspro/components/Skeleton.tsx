import { useEffect, useMemo } from 'react';
import { View, DimensionValue, StyleSheet, ViewStyle, useWindowDimensions, Animated } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';

// Ref-counted: the shared loop runs only while at least one instance is mounted.
const _shimmerProgress = new Animated.Value(0);
let _shimmerMountCount = 0;
let _shimmerAnimation: Animated.CompositeAnimation | null = null;

function startShimmerLoop() {
  _shimmerMountCount++;
  if (_shimmerMountCount === 1) {
    _shimmerAnimation = Animated.loop(
      Animated.timing(_shimmerProgress, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    _shimmerAnimation.start();
  }
}

function stopShimmerLoop() {
  _shimmerMountCount = Math.max(0, _shimmerMountCount - 1);
  if (_shimmerMountCount === 0 && _shimmerAnimation) {
    _shimmerAnimation.stop();
    _shimmerAnimation = null;
    _shimmerProgress.setValue(0);
  }
}

function ShimmerBlock({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const { width: SCREEN_W } = useWindowDimensions();

  useEffect(() => {
    startShimmerLoop();
    return stopShimmerLoop;
  }, []);

  const translateX = useMemo(
    () => _shimmerProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [-SCREEN_W, SCREEN_W],
    }),
    [SCREEN_W],
  );

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.bgSkeleton,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.bgSkeletonHighlight,
            opacity: 0.5,
          },
          { transform: [{ translateX }] },
        ]}
      />
    </View>
  );
}

function RowSkeleton({ isFirst }: { isFirst: boolean }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View
      style={[
        skStyles.row,
        { flexDirection: dir.row },
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight },
      ]}
    >
      <ShimmerBlock width={40} height={40} borderRadius={12} />
      <View style={skStyles.rowText}>
        <ShimmerBlock width="60%" height={14} />
        <ShimmerBlock width="40%" height={12} />
      </View>
      <ShimmerBlock width={36} height={14} />
    </View>
  );
}

/** Placeholder matching the grouped list cards (recent activity, history, clients). */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  const theme = useTheme();
  return (
    <View style={[skStyles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      {Array.from({ length: count }).map((_, i) => (
        <RowSkeleton key={i} isFirst={i === 0} />
      ))}
    </View>
  );
}

const skStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowText: { flex: 1, gap: 8 },
});
