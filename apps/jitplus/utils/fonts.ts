import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Maps Lexend weights to Cairo equivalents for Arabic script rendering.
 * Lexend (Latin-only) → Cairo (Arabic + Latin) when locale is 'ar'.
 */
const FONT_MAP = {
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

type FontWeight = keyof typeof FONT_MAP.default;

export function getFontFamily(locale: string, weight: FontWeight = 'regular'): string {
  const map = locale === 'ar' ? FONT_MAP.ar : FONT_MAP.default;
  return map[weight];
}

/** Hook returning locale-aware font families */
export function useAppFonts() {
  const { locale } = useLanguage();
  const isArabic = locale === 'ar';
  return {
    regular: isArabic ? FONT_MAP.ar.regular : FONT_MAP.default.regular,
    medium: isArabic ? FONT_MAP.ar.medium : FONT_MAP.default.medium,
    semibold: isArabic ? FONT_MAP.ar.semibold : FONT_MAP.default.semibold,
    bold: isArabic ? FONT_MAP.ar.bold : FONT_MAP.default.bold,
  };
}
