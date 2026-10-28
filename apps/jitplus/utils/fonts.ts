import { useLanguage } from '@/contexts/LanguageContext';
import { FONT_MAP } from '@/utils/fontResolution';

export { getFontFamily } from '@/utils/fontResolution';

/** Hook returning locale-aware font families */
export function useAppFonts() {
  const { locale } = useLanguage();
  return locale === 'ar' ? FONT_MAP.ar : FONT_MAP.default;
}
