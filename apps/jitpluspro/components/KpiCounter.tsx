import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, AccessibilityInfo, type StyleProp, type TextStyle } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import { EASE_OUT } from '@/utils/motion';

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
  const [anim] = useState(() => new Animated.Value(0));
  const countedRef = useRef(false);
  const animatingRef = useRef(false);

  // First reveal: count up 0 → value once, when the data is ready.
  useEffect(() => {
    if (!ready || countedRef.current) return;
    countedRef.current = true;
    // Nothing to count up to: the sync effect below shows the value.
    if (value <= 0) return;
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
        // Re-render only when the shown integer changes, not on every frame.
        let last = -1;
        listenerId = anim.addListener(({ value: v }) => {
          const r = Math.round(v);
          if (r !== last) {
            last = r;
            setDisplay(r);
          }
        });
        Animated.timing(anim, {
          toValue: value,
          duration: 600,
          easing: EASE_OUT,
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
