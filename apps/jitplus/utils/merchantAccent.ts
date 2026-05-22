import { palette } from '@/contexts/ThemeContext';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function getMerchantAccent(themeColor?: string | null): string {
  if (themeColor && HEX.test(themeColor)) return themeColor;
  return palette.violet;
}
