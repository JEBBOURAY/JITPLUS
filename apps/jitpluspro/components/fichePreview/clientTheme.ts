/**
 * Colors of the jitplus client app (apps/jitplus/contexts/ThemeContext.tsx),
 * limited to the tokens the merchant page uses. The preview renders with these
 * rather than the Pro theme, whose borders, inputs and dark background differ.
 * Keep in step with the client theme.
 */
import { useTheme } from '@/contexts/ThemeContext';

export interface ClientTheme {
  mode: 'light' | 'dark';
  bg: string;
  bgCard: string;
  bgInput: string;
  bgSkeleton: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
}

const light: ClientTheme = {
  mode: 'light',
  bg: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgInput: '#F7F8FA',
  bgSkeleton: '#F1F2F4',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  primary: '#7C3AED',
  border: 'rgba(0,0,0,0.08)',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const dark: ClientTheme = {
  mode: 'dark',
  bg: '#0F172A',
  bgCard: '#1E293B',
  bgInput: '#1E293B',
  bgSkeleton: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  primary: '#A78BFA',
  border: 'rgba(255,255,255,0.10)',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
};

/** Client colors for the mode the Pro app is currently in. */
export function useClientTheme(): ClientTheme {
  return useTheme().mode === 'dark' ? dark : light;
}
