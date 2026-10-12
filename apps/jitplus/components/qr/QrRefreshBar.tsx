import React, { useEffect, useState } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { hp } from '@/utils/responsive';

interface QrRefreshBarProps {
  /** Time until the next token refresh. The bar restarts whenever this or `cycleKey` changes. */
  durationMs: number;
  cycleKey: string;
  color: string;
  trackColor: string;
}

/**
 * Countdown bar animated on its own so the (expensive) QR SVG never
 * re-renders on each tick.
 */
export default React.memo(function QrRefreshBar({ durationMs, cycleKey, color, trackColor }: QrRefreshBarProps) {
  const [progress] = useState(() => new Animated.Value(1));

  useEffect(() => {
    progress.setValue(1);
    const anim = Animated.timing(progress, {
      toValue: 0, duration: Math.max(0, durationMs), easing: Easing.linear, useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [durationMs, cycleKey, progress]);

  return (
    <View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[styles.fill, {
          backgroundColor: color,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  track: { height: hp(3), borderRadius: 999, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: '100%', borderRadius: 999 },
});
