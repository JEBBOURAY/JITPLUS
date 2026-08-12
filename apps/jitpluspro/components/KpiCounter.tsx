import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, Easing, AccessibilityInfo, type StyleProp, type TextStyle } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';

interface Props {
  value: number;
  /** Run the one-time count-up only once the value is actually loaded. */
  ready?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * Isolated, memoized KPI number. Owns its count-up animation so the parent
 * Accueil screen doesn't re-render on every animation frame. Respects
 * reduce-motion and stops/cleans the animation on unmount.
 */
function KpiCounter({ value, ready = true, style }: Props) {
  const { locale } = useLanguage();
  const [display, setDisplay] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const countedRef = useRef(false);
  const animatingRef = useRef(false);

  // First reveal: count up 0 → value once, when the data is ready.
  useEffect(() => {
    if (!ready || countedRef.current) return;
    countedRef.current = true;
    if (value <= 0) {
      setDisplay(value);
      return;
    }
    let cancelled = false;
    let listenerId: string | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) return;
        if (reduceMotion) {
          setDisplay(value);
          return;
        }
        animatingRef.current = true;
        anim.setValue(0);
        listenerId = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
        Animated.timing(anim, {
          toValue: value,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start(() => {
          animatingRef.current = false;
          setDisplay(value);
        });
      })
      .catch(() => setDisplay(value));
    return () => {
      cancelled = true;
      anim.stopAnimation();
      if (listenerId) anim.removeListener(listenerId);
    };
  }, [ready, value, anim]);

  // After the intro animation, keep synced with later data updates.
  useEffect(() => {
    if (countedRef.current && !animatingRef.current) setDisplay(value);
  }, [value]);

  return (
    <Text style={style} maxFontSizeMultiplier={1.3}>
      {display.toLocaleString(getIntlLocale(locale))}
    </Text>
  );
}

export default React.memo(KpiCounter);
