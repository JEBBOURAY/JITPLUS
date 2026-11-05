import React, { useCallback, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

const SPRING = { speed: 40, bounciness: 6, useNativeDriver: true } as const;
const PRESSED_SCALE = 0.97;

/**
 * Wraps a touchable and squeezes it slightly while pressed. Pass the returned
 * handlers to the child's onPressIn / onPressOut through the render prop.
 */
export default function PressScale({ children, style }: {
  children: (handlers: { onPressIn: () => void; onPressOut: () => void }) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: PRESSED_SCALE, ...SPRING }).start();
  }, [scale]);
  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, ...SPRING }).start();
  }, [scale]);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children({ onPressIn, onPressOut })}
    </Animated.View>
  );
}
