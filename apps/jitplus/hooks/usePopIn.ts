import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const POP_FROM = 0.85;

/** Scale that settles to 1 each time `active` turns true, once a sheet has started rising. */
export function usePopIn(active: boolean): Animated.Value {
  const reduceMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(reduceMotion ? 1 : POP_FROM));

  useEffect(() => {
    if (!active || reduceMotion) return;
    scale.setValue(POP_FROM);
    const anim = Animated.sequence([
      Animated.delay(120),
      Animated.timing(scale, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [active, reduceMotion, scale]);

  return scale;
}
