import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/** One confetti particle, driven by a shared progress value (0 → 1). */
function ConfettiParticle({
  progress, x0, vx, vy, size, color,
}: {
  progress: SharedValue<number>;
  x0: number; vx: number; vy: number; size: number; color: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) * 4),
      transform: [
        { translateX: x0 + vx * p - size },
        { translateY: -20 + vy * p + 0.5 * 900 * p * p - size },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.confetti,
        { width: size * 2, height: size * 2, borderRadius: size, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

interface Props {
  progress: SharedValue<number>;
  screenW: number;
  accent: string;
}

export default React.memo(function ScratchConfetti({ progress, screenW, accent }: Props) {
  const confetti = useMemo(() => {
    const colors = [accent, '#FCD34D', '#FFFFFF', '#A78BFA', '#F472B6'];
    return Array.from({ length: 32 }, (_, i) => ({
      x0: Math.random() * screenW,
      vx: (Math.random() - 0.5) * 160,
      vy: 140 + Math.random() * 320,
      size: 3 + Math.random() * 4,
      color: colors[i % colors.length],
    }));
  }, [screenW, accent]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {confetti.map((p, i) => (
        <ConfettiParticle key={i} progress={progress} {...p} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  confetti: { position: 'absolute', left: 0, top: 0 },
});
