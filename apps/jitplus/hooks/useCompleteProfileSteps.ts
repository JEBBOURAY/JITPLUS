import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Animated, Easing, I18nManager, ScrollView } from 'react-native';
import { SPRING_SMOOTH, rnSpring } from '@/utils/motion';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export function useCompleteProfileSteps() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  // A second tap during the 120ms exit would run the step change twice and make the card jump.
  const busyRef = useRef(false);

  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateStep = useCallback((next: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    // Flip the slide direction in RTL so "next" still leaves towards the reading start.
    const dir = (next > step ? 1 : -1) * (I18nManager.isRTL ? -1 : 1);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, easing: EASE_OUT, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: dir * -40, duration: 120, easing: EASE_OUT, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) {
        busyRef.current = false;
        return;
      }
      setStep(next);
      setError('');
      slideAnim.setValue(dir * 40);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.parallel([
        Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) }),
      ]).start(() => { busyRef.current = false; });
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
