import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const SWEEP_DURATION_MS = 2200;
const SWEEP_EASING = Easing.inOut(Easing.ease);

export const ScanLine = React.memo(function ScanLine({ scanSize, active }: { scanSize: number; active: boolean }) {
  const reduceMotion = useReduceMotion() === true;
  const [progress] = useState(() => new Animated.Value(0));

  // One native timing for the whole down-and-up cycle: a looped sequence goes
  // back through JS at the end of each leg.
  useEffect(() => {
    if (!active || reduceMotion) {
      progress.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: SWEEP_DURATION_MS * 2, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [active, reduceMotion, progress]);

  const translateY = useMemo(() => {
    const end = scanSize - 4;
    // Reduced motion: a still line across the middle of the frame.
    if (reduceMotion) return end / 2;
    // The easing applies per segment, so each leg still slows at the edges.
    return progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, end, 0], easing: SWEEP_EASING });
  }, [progress, reduceMotion, scanSize]);

  return (
    <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]}>
      <View style={styles.bar} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 3,
    top: 0,
  },
  bar: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#A78BFA',
    opacity: 0.7,
  },
});
