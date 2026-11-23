import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useSplashStore } from '@/stores/splashStore';

/** Google, Apple, divider, email, sign-up: staggered in that order. */
export const INTRO_ITEMS = 5;
/** Start the intro anyway if the splash never reports that it opened. */
const SPLASH_FALLBACK_MS = 3000;

export interface LoginIntroValues {
  /** JS-driven: SVG stroke offset can't run on the native driver. */
  draw: Animated.Value;
  reveal: Animated.Value;
  keystone: Animated.Value;
  text: Animated.Value;
  items: Animated.Value[];
  twinkle: Animated.Value;
}

/**
 * Login entrance choreography: the arch draws, the crest and text rise, then
 * the buttons stagger in and the divider twinkles. The screen mounts under the
 * animated splash, so it waits until the splash opens (or a 3 s fallback).
 * `reduceMotion` null = not known yet: nothing starts.
 */
export function useLoginIntro(reduceMotion: boolean | null) {
  const splashOpened = useSplashStore((s) => s.done);
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  const introStarted = splashOpened || splashTimedOut;

  useEffect(() => {
    if (splashOpened) return;
    const timer = setTimeout(() => setSplashTimedOut(true), SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [splashOpened]);

  const [intro] = useState<LoginIntroValues>(() => ({
    draw: new Animated.Value(0),
    reveal: new Animated.Value(0),
    keystone: new Animated.Value(0),
    text: new Animated.Value(0),
    items: Array.from({ length: INTRO_ITEMS }, () => new Animated.Value(0)),
    twinkle: new Animated.Value(0),
  }));

  useEffect(() => {
    if (!introStarted || reduceMotion === null) return;
    const shown = [intro.reveal, intro.keystone, intro.text, ...intro.items];

    if (reduceMotion) {
      intro.draw.setValue(1);
      const fade = Animated.parallel(shown.map((v) => Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true })));
      fade.start();
      return () => fade.stop();
    }

    const after = (ms: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(ms), anim]);
    const sequence = Animated.parallel([
      Animated.timing(intro.draw, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      after(160, Animated.spring(intro.reveal, { toValue: 1, speed: 12, bounciness: 6, useNativeDriver: true })),
      after(280, Animated.timing(intro.text, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true })),
      after(400, Animated.timing(intro.keystone, { toValue: 1, duration: 300, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true })),
      after(360, Animated.stagger(50, intro.items.map((v) => Animated.spring(v, { toValue: 1, speed: 16, bounciness: 5, useNativeDriver: true })))),
      after(900, Animated.sequence([
        Animated.timing(intro.twinkle, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(intro.twinkle, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ])),
    ]);
    sequence.start();
    return () => sequence.stop();
  }, [introStarted, reduceMotion, intro]);

  return { intro, introStarted };
}
