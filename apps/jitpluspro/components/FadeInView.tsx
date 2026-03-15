import { useEffect, useRef, useMemo } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { hp } from '@/utils/responsive';

interface FadeInViewProps {
  delay?: number;
  duration?: number;
  from?: 'bottom' | 'left' | 'right' | 'none';
  distance?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}

export default function FadeInView({
  delay = 0,
  duration = 500,
  from = 'bottom',
  distance = hp(20),
  style,
  children,
}: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transform = useMemo(() =>
    from === 'bottom'
      ? [{ translateY: translate }]
      : from === 'left'
      ? [{ translateX: Animated.multiply(translate, -1) }]
      : from === 'right'
      ? [{ translateX: translate }]
      : [],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [from]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
