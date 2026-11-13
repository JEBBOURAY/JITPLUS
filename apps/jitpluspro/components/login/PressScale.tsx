import React, { useCallback, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { spring } from '@/utils/sheetPhysics';

// Press feedback carries no momentum: quick and without overshoot, so it can be reversed mid-way.
const SPRING = { ...spring(1, 0.2), useNativeDriver: true } as const;
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
