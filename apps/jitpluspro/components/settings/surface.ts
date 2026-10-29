import type { ThemeColors } from '@/contexts/ThemeContext';

/** Light elevation used instead of borders for every loyalty-settings surface. */
export function surfaceShadow(theme: ThemeColors) {
  return theme.mode === 'dark'
    ? null
    : { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 };
}

export function fieldFill(theme: ThemeColors) {
  return theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : theme.bgInput;
}
