import React, { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

/** Fades its children in with a short downward slide when mounted. */
export default function FadeSlideIn({ children }: { children: React.ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}
