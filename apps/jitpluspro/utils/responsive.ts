import { Dimensions } from 'react-native';

// Base dimensions (iPhone 14 Pro as reference)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

let SCREEN_WIDTH = Dimensions.get('window').width;
let SCREEN_HEIGHT = Dimensions.get('window').height;

function _wp(size: number): number {
  return Math.round((SCREEN_WIDTH / BASE_WIDTH) * size);
}
function _ms(size: number, factor: number = 0.5): number {
  return Math.round(size + (_wp(size) - size) * factor);
}

function recalcDerived() {
  radius.sm = _wp(8);
  radius.md = _wp(12);
  radius.lg = _wp(16);
  radius.xl = _wp(20);
  radius['2xl'] = _wp(24);

  fontSize.xs = _ms(11);
  fontSize.sm = _ms(13);
  fontSize.md = _ms(15);
  fontSize.lg = _ms(17);
  fontSize.xl = _ms(20);
  fontSize['2xl'] = _ms(24);
  fontSize['3xl'] = _ms(28);
  fontSize['4xl'] = _ms(32);

  iconSize.sm = _ms(16);
  iconSize.md = _ms(20);
  iconSize.lg = _ms(24);
  iconSize.xl = _ms(28);
  iconSize['2xl'] = _ms(32);
}

Dimensions.addEventListener('change', ({ window }) => {
  SCREEN_WIDTH = window.width;
  SCREEN_HEIGHT = window.height;
  SCREEN.width = SCREEN_WIDTH;
  SCREEN.height = SCREEN_HEIGHT;
  SCREEN.isSmall = SCREEN_WIDTH < 360;
  SCREEN.isMedium = SCREEN_WIDTH >= 360 && SCREEN_WIDTH < 400;
  SCREEN.isLarge = SCREEN_WIDTH >= 400;
  recalcDerived();
});

/** Horizontal scale — scales a value based on screen width */
export function wp(size: number): number {
  return Math.round((SCREEN_WIDTH / BASE_WIDTH) * size);
}

/** Vertical scale — scales a value based on screen height */
export function hp(size: number): number {
  return Math.round((SCREEN_HEIGHT / BASE_HEIGHT) * size);
}

/** Moderate scale — for font sizes and spacing (less aggressive scaling) */
export function ms(size: number, factor: number = 0.5): number {
  return Math.round(size + (wp(size) - size) * factor);
}

export const SCREEN = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmall: SCREEN_WIDTH < 360,
  isMedium: SCREEN_WIDTH >= 360 && SCREEN_WIDTH < 400,
  isLarge: SCREEN_WIDTH >= 400,
};

export const radius: Record<string, number> = {
  sm: _wp(8),
  md: _wp(12),
  lg: _wp(16),
  xl: _wp(20),
  '2xl': _wp(24),
  full: 9999,
};

export const fontSize: Record<string, number> = {
  xs: _ms(11),
  sm: _ms(13),
  md: _ms(15),
  lg: _ms(17),
  xl: _ms(20),
  '2xl': _ms(24),
  '3xl': _ms(28),
  '4xl': _ms(32),
};

export const iconSize: Record<string, number> = {
  sm: _ms(16),
  md: _ms(20),
  lg: _ms(24),
  xl: _ms(28),
  '2xl': _ms(32),
};
