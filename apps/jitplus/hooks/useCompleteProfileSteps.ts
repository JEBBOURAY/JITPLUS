import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Animated, ScrollView } from 'react-native';

export function useCompleteProfileSteps() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateStep = useCallback((next: number) => {
    const dir = next > step ? 1 : -1;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: dir * -40, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      setError('');
      slideAnim.setValue(dir * 40);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.parallel([
        Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4 }),
      ]).start();
    });
  }, [step, fadeAnim, slideAnim]);

  const stepStyle = useMemo(() => ({
    opacity: fadeAnim,
    transform: [{ translateX: slideAnim }],
  }), [fadeAnim, slideAnim]);

  const headerStyle = useMemo(() => ({
    opacity: headerAnim,
    transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
  }), [headerAnim]);

  return { step, error, setError, scrollRef, animateStep, stepStyle, headerStyle };
}
