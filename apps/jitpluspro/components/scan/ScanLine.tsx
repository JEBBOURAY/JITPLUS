import React, { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

const SWEEP_DURATION_MS = 2200;

export const ScanLine = React.memo(function ScanLine({ scanSize, active }: { scanSize: number; active: boolean }) {
  const [translateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      translateY.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: scanSize - 4, duration: SWEEP_DURATION_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: SWEEP_DURATION_MS, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [active, scanSize, translateY]);

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
    ...Platform.select({
      ios: {
        shadowColor: '#1F2937',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
    }),
  },
});
