import React, { useEffect } from 'react';
import { I18nManager, View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
 * re-renders on each tick. The fill keeps its full width and slides out of
 * the clipped track (transform only, on the UI thread) instead of animating
 * `width`, which would relayout from JS on every frame.
 */
export default React.memo(function QrRefreshBar({ durationMs, cycleKey, color, trackColor }: QrRefreshBarProps) {
  const progress = useSharedValue(1);
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    progress.set(1);
    progress.set(withTiming(0, {
      duration: Math.max(0, durationMs),
      easing: Easing.linear,
      // A countdown is information, not decoration: keep it under reduced motion.
      reduceMotion: ReduceMotion.Never,
    }));
    return () => cancelAnimation(progress);
  }, [durationMs, cycleKey, progress]);

  const onLayout = (e: LayoutChangeEvent) => trackWidth.set(e.nativeEvent.layout.width);

  // RTL anchors the fill on the right, so it slides out the other way.
  const dir = I18nManager.isRTL ? 1 : -1;
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dir * (1 - progress.get()) * trackWidth.get() }],
  }));

  return (
    <View style={[styles.track, { backgroundColor: trackColor }]} onLayout={onLayout}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
});

const styles = StyleSheet.create({
  track: { height: hp(3), borderRadius: 999, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { width: '100%', height: '100%', borderRadius: 999 },
});
