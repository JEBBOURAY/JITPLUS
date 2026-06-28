import { useEffect, useMemo, useRef } from 'react';
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
  }, [isFocused, progress]);

  // Memoize so the style object reference is stable across renders;
  // otherwise every parent re-render forces RN to diff a fresh style.
  const focusStyle = useMemo(
    () => ({
      opacity: progress,
      transform: [
        {
          scale: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.98, 1],
          }),
        },
      ],
    }),
    [progress],
  );

  return { isFocused, focusStyle };
}
