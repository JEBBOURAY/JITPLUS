import type { TextStyle } from 'react-native';

export type FontWeightKey = 'regular' | 'medium' | 'semibold' | 'bold';

/**
 * Lexend has no Arabic glyphs, so Arabic uses Cairo with the same weights.
 */
export const FONT_MAP = {
  ar: {
    regular: 'Cairo_400Regular',
    medium: 'Cairo_500Medium',
    semibold: 'Cairo_600SemiBold',
    bold: 'Cairo_700Bold',
  },
  default: {
    regular: 'Lexend_400Regular',
    medium: 'Lexend_500Medium',
    semibold: 'Lexend_600SemiBold',
    bold: 'Lexend_700Bold',
  },
} as const;

const WEIGHTS: FontWeightKey[] = ['regular', 'medium', 'semibold', 'bold'];
const LEXEND_TO_CAIRO = new Map<string, string>(WEIGHTS.map((w) => [FONT_MAP.default[w], FONT_MAP.ar[w]]));
const CAIRO_TO_LEXEND = new Map<string, string>(WEIGHTS.map((w) => [FONT_MAP.ar[w], FONT_MAP.default[w]]));

export function getFontFamily(locale: string, weight: FontWeightKey = 'regular'): string {
  return (locale === 'ar' ? FONT_MAP.ar : FONT_MAP.default)[weight];
}

export function weightKeyFor(fontWeight: TextStyle['fontWeight']): FontWeightKey {
  switch (String(fontWeight ?? '')) {
    case '500':
    case 'medium':
      return 'medium';
    case '600':
    case 'semibold':
      return 'semibold';
    case '700':
    case '800':
    case '900':
    case 'bold':
    case 'heavy':
    case 'black':
    case 'condensedBold':
      return 'bold';
    default:
      return 'regular';
  }
}

/**
 * Font override for a text style in the given locale, or null to keep the style as is.
 * - an app font (Lexend/Cairo) is swapped for the same weight in the locale's script;
 * - another explicit family (monospace, SpaceMono...) is left untouched;
 * - no family: the locale font matching `fontWeight`, except for nested text
 *   without a weight, which must inherit its parent's font.
 */
export function resolveFontStyle(
  style: TextStyle | undefined | null,
  locale: string,
  nested = false,
): { fontFamily: string } | null {
  const family = style?.fontFamily;
  if (family) {
    const mapped = locale === 'ar' ? LEXEND_TO_CAIRO.get(family) : CAIRO_TO_LEXEND.get(family);
    return mapped ? { fontFamily: mapped } : null;
  }
  if (nested && style?.fontWeight == null) return null;
  return { fontFamily: getFontFamily(locale, weightKeyFor(style?.fontWeight)) };
}
