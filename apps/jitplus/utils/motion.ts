/**
 * Motion primitives for gesture-driven UI (sheets, swipes).
 *
 * Springs are described the way Apple's UIKit does it — a damping ratio and a
 * response time — instead of raw stiffness/damping. A spring has no fixed
 * duration, it starts from the value on screen and takes the finger's velocity,
 * so a moving element can be grabbed and reversed at any instant.
 *
 * Every helper is a worklet: callable from gesture callbacks on the UI thread.
 */
import { Easing, type WithSpringConfig } from 'react-native-reanimated';

/** Strong ease-out for things entering or responding (0.23, 1, 0.32, 1). */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Ease-in-out for things moving on screen (0.77, 0, 0.175, 1). */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/**
 * @param response      seconds to (visually) reach the target — lower is snappier
 * @param dampingRatio  1 = no overshoot; < 1 overshoots (use only after a flick/drag)
 * @param velocity      initial velocity in px/s (hand over the gesture's release velocity)
 */
export function spring(response: number, dampingRatio: number, velocity = 0): WithSpringConfig {
  'worklet';
  const omega = (2 * Math.PI) / response;
  return { mass: 1, stiffness: omega * omega, damping: 2 * dampingRatio * omega, velocity };
}

/** Default UI spring: critically damped, settles without bouncing. */
export const SPRING_SMOOTH = { response: 0.35, dampingRatio: 1 } as const;
/** After a drag or flick: slight overshoot, because the gesture carried momentum. */
export const SPRING_MOMENTUM = { response: 0.3, dampingRatio: 0.8 } as const;

/**
 * Distance a flick travels before coming to rest (exponential decay, like scroll).
 * 0.998 matches a normal scroll; lower values make the projection shorter.
 */
export function project(velocity: number, decelerationRate = 0.995): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further you pull, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  'worklet';
  const sign = overshoot < 0 ? -1 : 1;
  const abs = Math.abs(overshoot);
  return sign * ((abs * dimension * constant) / (dimension + constant * abs));
}

/**
 * Same springs for the legacy `Animated.spring` API (screens not yet on Reanimated):
 * `Animated.spring(v, { toValue: 1, useNativeDriver: true, ...rnSpring(SPRING_SMOOTH) })`.
 */
export function rnSpring({ response, dampingRatio }: { response: number; dampingRatio: number }) {
  const { mass, stiffness, damping } = spring(response, dampingRatio);
  return { mass: mass as number, stiffness: stiffness as number, damping: damping as number };
}
