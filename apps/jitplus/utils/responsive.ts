import { Dimensions } from 'react-native';

// Base dimensions (iPhone 14 Pro as reference)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

// Subscribe to dimension changes so values stay accurate on rotation/resize
let SCREEN_WIDTH = Dimensions.get('window').width;
let SCREEN_HEIGHT = Dimensions.get('window').height;

// Internal helpers that always use the current SCREEN_WIDTH / SCREEN_HEIGHT
function _wp(size: number): number {
  return Math.round((SCREEN_WIDTH / BASE_WIDTH) * size);
}
function _ms(size: number, factor: number = 0.5): number {
  return Math.round(size + (_wp(size) - size) * factor);
}

// Keep dimensions in sync. Note: the subscription is intentionally never
// removed because this module lives for the entire app lifetime.
Dimensions.addEventListener('change', ({ window }) => {
  SCREEN_WIDTH = window.width;
  SCREEN_HEIGHT = window.height;
});

/**
 * Horizontal scale — scales a value based on screen width
 */
export function wp(size: number): number {
  return _wp(size);
}

/**
 * Vertical scale — scales a value based on screen height
 */
export function hp(size: number): number {
  return Math.round((SCREEN_HEIGHT / BASE_HEIGHT) * size);
}

/**
 * Moderate scale — for font sizes and spacing (less aggressive scaling)
 * factor 0.5 = halfway between fixed and fully scaled
 */
export function ms(size: number, factor: number = 0.5): number {
  return _ms(size, factor);
}

/**
 * Get screen dimensions — reads live values on every access via getters.
 */
export const SCREEN = {
  get width() { return SCREEN_WIDTH; },
  get height() { return SCREEN_HEIGHT; },
  get isSmall() { return SCREEN_WIDTH < 360; },
  get isMedium() { return SCREEN_WIDTH >= 360 && SCREEN_WIDTH < 400; },
  get isLarge() { return SCREEN_WIDTH >= 400; },
};

/**
 * Common responsive radius values — recomputed on every access.
 */
export const radius: Record<string, number> = Object.defineProperties({} as Record<string, number>, {
  sm:   { get() { return _wp(8); },  enumerable: true },
  md:   { get() { return _wp(12); }, enumerable: true },
  lg:   { get() { return _wp(16); }, enumerable: true },
  xl:   { get() { return _wp(20); }, enumerable: true },
  '2xl': { get() { return _wp(24); }, enumerable: true },
  full: { get() { return 9999; },    enumerable: true },
});

/**
 * Responsive font sizes — recomputed on every access.
 */
export const fontSize: Record<string, number> = Object.defineProperties({} as Record<string, number>, {
  xs:      { get() { return _ms(11); }, enumerable: true },
  sm:      { get() { return _ms(13); }, enumerable: true },
  md:      { get() { return _ms(15); }, enumerable: true },
  lg:      { get() { return _ms(17); }, enumerable: true },
  xl:      { get() { return _ms(20); }, enumerable: true },
  '2xl':   { get() { return _ms(24); }, enumerable: true },
  '3xl':   { get() { return _ms(28); }, enumerable: true },
  '4xl':   { get() { return _ms(32); }, enumerable: true },
  '5xl':   { get() { return _ms(40); }, enumerable: true },
  display: { get() { return _ms(52); }, enumerable: true },
});


