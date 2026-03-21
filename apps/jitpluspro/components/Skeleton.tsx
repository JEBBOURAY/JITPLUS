import React, { useEffect } from 'react';
import { View, DimensionValue, StyleSheet, ViewStyle, useWindowDimensions, Animated } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

// ── Shared shimmer animation (ref-counted: runs only while at least one instance is mounted) ──────
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

/** A single shimmering rectangle */
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
    return () => stopShimmerLoop();
  }, []);

  const translateX = _shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_W, SCREEN_W],
  });

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

/** Skeleton placeholder for a client card */
export function ClientCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={[
        skStyles.card,
        {
          backgroundColor: theme.bgCard,
          borderColor: theme.borderLight,
        },
      ]}
    >
      <ShimmerBlock width={48} height={48} borderRadius={24} />
      <View style={skStyles.flexMarginGap}>
        <ShimmerBlock width="70%" height={14} />
        <ShimmerBlock width="45%" height={12} />
      </View>
      <ShimmerBlock width={60} height={28} borderRadius={12} />
    </View>
  );
}

/** Skeleton list (multiple client cards) */
export function ClientListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={skStyles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <ClientCardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Skeleton placeholder for activity card */
export function ActivityCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={[
        skStyles.actCard,
        {
          backgroundColor: theme.bgCard,
          borderColor: theme.borderLight,
        },
      ]}
    >
      <ShimmerBlock width={38} height={38} borderRadius={19} />
      <View style={skStyles.flexMarginGap}>
        <ShimmerBlock width="60%" height={14} />
        <ShimmerBlock width="40%" height={12} />
      </View>
      <View style={skStyles.alignEndGap}>
        <ShimmerBlock width={50} height={13} />
        <ShimmerBlock width={40} height={14} />
      </View>
    </View>
  );
}

export function ActivityListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={skStyles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <ActivityCardSkeleton key={i} />
      ))}
    </View>
  );
}

const skStyles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  actCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    borderColor: '#e2e8f0',
  },
  flexMarginGap: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  alignEndGap: {
    alignItems: 'flex-end',
    gap: 6,
  },
});

export default ShimmerBlock;
