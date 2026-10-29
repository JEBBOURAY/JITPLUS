import { Dimensions } from 'react-native';

/**
 * Design-reference dimensions (iPhone 14 Pro).
 * All `wp`/`hp`/`ms` values scale relative to this baseline.
 * Do NOT replace these with the actual device size — that would
 * make every scaling call return the input unchanged.
 */
const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;

let SCREEN_WIDTH = Dimensions.get('window').width;
let SCREEN_HEIGHT = Dimensions.get('window').height;

/** Clamp extreme scaling on very large (tablets) or very small screens */
function clampScale(raw: number): number {
  return Math.min(Math.max(raw, 0.75), 1.35);
}

function recalcDerived() {
  radius.sm = wp(8);
  radius.md = wp(12);
  radius.lg = wp(16);
  radius.xl = wp(20);
  radius['2xl'] = wp(24);

  fontSize.xs = ms(11);
  fontSize.sm = ms(13);
  fontSize.md = ms(15);
  fontSize.lg = ms(17);
  fontSize.xl = ms(20);
  fontSize['2xl'] = ms(24);
  fontSize['3xl'] = ms(28);
  fontSize['4xl'] = ms(32);
}

Dimensions.addEventListener('change', ({ window }) => {
  SCREEN_WIDTH = window.width;
  SCREEN_HEIGHT = window.height;
  recalcDerived();
});

/** Horizontal scale — scales a value based on screen width */
export function wp(size: number): number {
  return Math.round(clampScale(SCREEN_WIDTH / DESIGN_WIDTH) * size);
}

/** Vertical scale — scales a value based on screen height */
export function hp(size: number): number {
  return Math.round(clampScale(SCREEN_HEIGHT / DESIGN_HEIGHT) * size);
}

/** Moderate scale — for font sizes and spacing (less aggressive scaling) */
export function ms(size: number, factor: number = 0.5): number {
  return Math.round(size + (wp(size) - size) * factor);
}

type RadiusKey = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
type FontSizeKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

export const radius: Record<RadiusKey, number> = {
  sm: wp(8),
  md: wp(12),
  lg: wp(16),
  xl: wp(20),
  '2xl': wp(24),
  full: 9999,
};

export const fontSize: Record<FontSizeKey, number> = {
  xs: ms(11),
  sm: ms(13),
  md: ms(15),
  lg: ms(17),
  xl: ms(20),
  '2xl': ms(24),
  '3xl': ms(28),
  '4xl': ms(32),
};
