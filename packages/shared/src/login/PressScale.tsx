import React, { useCallback, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

export type PressScaleSpring = Omit<Animated.SpringAnimationConfig, 'toValue' | 'useNativeDriver'>;

// Press feedback carries no momentum: quick and without overshoot, so it can be reversed mid-way.
const DEFAULT_SPRING: PressScaleSpring = { speed: 40, bounciness: 0 };
const PRESSED_SCALE = 0.97;

/**
 * Wraps a touchable and squeezes it slightly while pressed. Pass the returned
 * handlers to the child's onPressIn / onPressOut through the render prop.
 * `spring` lets an app keep its own press physics (pass a stable object).
 */
export default function PressScale({ children, style, spring = DEFAULT_SPRING }: {
  children: (handlers: { onPressIn: () => void; onPressOut: () => void }) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
  spring?: PressScaleSpring;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: PRESSED_SCALE, ...spring, useNativeDriver: true }).start();
  }, [scale, spring]);
  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, ...spring, useNativeDriver: true }).start();
  }, [scale, spring]);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children({ onPressIn, onPressOut })}
    </Animated.View>
  );
}
