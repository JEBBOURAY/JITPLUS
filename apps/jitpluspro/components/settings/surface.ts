import type { ThemeColors } from '@/contexts/ThemeContext';

/** Fill of the inputs and segmented choices of the loyalty-card screens. */
export function fieldFill(theme: ThemeColors) {
  return theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : theme.bgInput;
}
