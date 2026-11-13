import { useRef, useCallback, useEffect, memo } from 'react';
import { Animated, Easing, TouchableWithoutFeedback, ViewStyle } from 'react-native';
import { haptic as fireHaptic } from '@/utils/haptics';

interface GlassCardProps {
  onPress?: () => void;
  style?: ViewStyle;
  children: React.ReactNode;
  haptic?: boolean;
  /** Kept for API compatibility (callers pass their corner radius); no longer used. */
  radius?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const PRESS_EASING = Easing.out(Easing.cubic);

export default memo(function GlassCard({
  onPress, style, children, haptic = true, accessibilityLabel, accessibilityHint,
}: GlassCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const currentAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    return () => { currentAnim.current?.stop(); };
  }, []);

  const animateTo = useCallback((toValue: number) => {
    currentAnim.current?.stop();
    currentAnim.current = Animated.timing(scale, {
      toValue,
      duration: 150,
      easing: PRESS_EASING,
      useNativeDriver: true,
    });
    currentAnim.current.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePressIn = useCallback(() => animateTo(0.98), [animateTo]);
  const handlePressOut = useCallback(() => animateTo(1), [animateTo]);

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
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
});
