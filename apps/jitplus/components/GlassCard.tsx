import { useRef, useCallback } from 'react';
import { Animated, TouchableWithoutFeedback, ViewStyle, StyleSheet } from 'react-native';
import { haptic as fireHaptic } from '@/utils/haptics';

interface GlassCardProps {
  onPress?: () => void;
  style?: ViewStyle;
  children: React.ReactNode;
  haptic?: boolean;
}

export default function GlassCard({ onPress, style, children, haptic = true }: GlassCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const currentAnim = useRef<Animated.CompositeAnimation | null>(null);

  const handlePressIn = useCallback(() => {
    currentAnim.current?.stop();
    currentAnim.current = Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.965,
        useNativeDriver: true,
        speed: 60,
        bounciness: 1,
      }),
      Animated.timing(glow, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]);
    currentAnim.current.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePressOut = useCallback(() => {
    currentAnim.current?.stop();
    currentAnim.current = Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 6,
      }),
      Animated.timing(glow, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);
    currentAnim.current.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = useCallback(() => {
    if (haptic) fireHaptic();
    onPress?.();
  }, [onPress, haptic]);

  return (
    <TouchableWithoutFeedback
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
        {/* Premium glow overlay on press */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            glassStyles.glowOverlay,
            { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.07] }) },
          ]}
        />
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const glassStyles = StyleSheet.create({
  glowOverlay: {
    backgroundColor: '#7C3AED',
    borderRadius: 16,
  },
});
