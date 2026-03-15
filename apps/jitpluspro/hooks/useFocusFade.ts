import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/**
 * Returns `{ isFocused, focusStyle }` — an animated style that
 * fades + scales in when the screen gains focus.
 * Uses React Native core Animated (no Reanimated dependency).
 */
export function useFocusFade() {
  const isFocused = useIsFocused();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isFocused ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const focusStyle = {
    opacity: progress,
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };

  return { isFocused, focusStyle };
}
