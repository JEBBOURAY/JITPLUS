import React, { useEffect, useRef } from 'react';
import { View, DimensionValue, StyleSheet, ViewStyle, useWindowDimensions, Animated } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

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
  const translateX = useRef(new Animated.Value(-SCREEN_W)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: SCREEN_W,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [SCREEN_W]);

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
      <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
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
      <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
        <ShimmerBlock width="55%" height={14} />
        <ShimmerBlock width="35%" height={11} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
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
});

export default ShimmerBlock;
