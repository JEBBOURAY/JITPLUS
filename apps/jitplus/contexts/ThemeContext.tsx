import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createThemeProvider } from '@jitplus/shared/src/createThemeProvider';

const THEME_STORAGE_KEY = '@jitplus_theme_mode';

// ── Palette ───────────────────────────────────────────────
export const palette = {
  // Primary violet spectrum
  violet: '#7C3AED',
  violetLight: '#A78BFA',
  violetDark: '#5B21B6',
  violetDeep: '#4C1D95',
  violetVivid: '#8B5CF6',
  violetSoft: '#C4B5FD',
  violetUltraLight: '#EDE9FE',
  // Gold accent spectrum  (Améthyste Solaire)
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  goldDark: '#D97706',
  goldSoft: '#FDE68A',
  goldUltraLight: '#FEF3C7',
  // Aliases kept for compat
  cyan: '#F59E0B',
  neonCyan: '#F59E0B',
  neonBlue: '#38BDF8',
  neonPink: '#F472B6',
  amber: '#F59E0B',
  emerald: '#10B981',
  red: '#EF4444',
  // Neutral spectrum
  white: '#FFFFFF',
  offWhite: '#FAFAFE',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray900: '#0F172A',
};

/** Violet → Gold gradient — "Améthyste Solaire" brand identity */
export const brandGradient = ['#7C3AED', '#F59E0B'] as const;
/** Extended 3-stop version for headers */
export const brandGradientFull = ['#5B21B6', '#7C3AED', '#F59E0B'] as const;

export interface ThemeColors {
  mode: 'light' | 'dark';
  bg: string;
  bgCard: string;
  bgElevated: string;
  bgHeader: string;
  bgTabBar: string;
  bgTabBarBorder: string;
  bgInput: string;
  bgSkeleton: string;
  bgSkeletonHighlight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryLight: string;
  primaryBg: string;
  accent: string;
  accentBg: string;
  border: string;
  borderLight: string;
  inputBorder: string;
  inputBg: string;
  inputPlaceholder: string;
  shadowColor: string;
  success: string;
  warning: string;
  danger: string;
}

const lightTheme: ThemeColors = {
  mode: 'light',
  bg: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgElevated: '#FFFFFF',
  bgHeader: '#7C3AED',
  bgTabBar: 'rgba(255,255,255,0.97)',
  bgTabBarBorder: 'rgba(0,0,0,0.06)',
  bgInput: '#F7F8FA',
  bgSkeleton: '#F1F2F4',
  bgSkeletonHighlight: '#E8E9EB',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',
  primary: '#7C3AED',
  primaryLight: '#8B5CF6',
  primaryBg: 'rgba(124,58,237,0.06)',
  accent: '#F59E0B',
  accentBg: 'rgba(245,158,11,0.08)',
  border: 'rgba(0,0,0,0.08)',
  borderLight: 'rgba(0,0,0,0.04)',
  inputBorder: '#E2E8F0',
  inputBg: '#F7F8FA',
  inputPlaceholder: '#94A3B8',
  shadowColor: 'rgba(0,0,0,0.06)',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const darkTheme: ThemeColors = {
  mode: 'dark',
  bg: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgElevated: '#FFFFFF',
  bgHeader: '#5B21B6',
  bgTabBar: 'rgba(255,255,255,0.97)',
  bgTabBarBorder: 'rgba(0,0,0,0.06)',
  bgInput: '#F7F8FA',
  bgSkeleton: '#F1F2F4',
  bgSkeletonHighlight: '#E8E9EB',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',
  primary: '#8B5CF6',
  primaryLight: '#A78BFA',
  primaryBg: 'rgba(139,92,246,0.12)',
  accent: '#F59E0B',
  accentBg: 'rgba(245,158,11,0.10)',
  border: 'rgba(0,0,0,0.08)',
  borderLight: 'rgba(0,0,0,0.04)',
  inputBorder: '#E2E8F0',
  inputBg: '#F7F8FA',
  inputPlaceholder: '#94A3B8',
  shadowColor: 'rgba(0,0,0,0.06)',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

export const { ThemeProvider, useTheme } = createThemeProvider<ThemeColors>({
  storageKey: THEME_STORAGE_KEY,
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, val) => AsyncStorage.setItem(key, val),
  },
  appearance: {
    getColorScheme: () => Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    subscribe: (cb) => {
      const sub = Appearance.addChangeListener(({ colorScheme }) =>
        cb(colorScheme === 'dark' ? 'dark' : 'light'),
      );
      return () => sub.remove();
    },
  },
  lightTheme,
  darkTheme,
});
