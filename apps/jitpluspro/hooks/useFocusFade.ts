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
  const progress = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    const target = isFocused ? 1 : 0;
    Animated.timing(progress, {
      toValue: target,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isFocused, progress]);

  // Memoize so the style object reference is stable across renders;
  // otherwise every parent re-render forces RN to diff a fresh style.
  const focusStyle = useMemo(
    () => ({
      // Never fade to 0: with tab freeze/transition edge-cases, a stale 0-opacity
      // state can look like a white screen. Keep a high baseline opacity instead.
      opacity: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.96, 1],
      }),
      transform: [
        {
          scale: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.995, 1],
          }),
        },
      ],
    }),
    [progress],
  );

  return { isFocused, focusStyle };
}
