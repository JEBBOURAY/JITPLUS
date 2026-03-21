import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createThemeProvider } from '@jitplus/shared/src/createThemeProvider';

const THEME_STORAGE_KEY = 'jitplus_theme_mode';

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
  // Charbon Pro accent spectrum
  charbon: '#1F2937',
  charbonLight: '#374151',
  charbonDark: '#111827',
  charbonSoft: '#4B5563',
  charbonUltraLight: '#9CA3AF',
  // Aliases kept for compat
  cyan: '#6B7280',
  neonCyan: '#6B7280',
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

/** Violet → Charbon gradient — "Violet Maître × Charbon Pro" brand identity */
export const brandGradient = ['#7C3AED', '#1F2937'] as const;
/** Extended 3-stop version for headers */
export const brandGradientFull = ['#5B21B6', '#7C3AED', '#1F2937'] as const;

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
  bgElevated: '#F8FAFC',
  bgHeader: '#7C3AED',
  bgTabBar: 'rgba(255,255,255,0.97)',
  bgTabBarBorder: 'rgba(0,0,0,0.06)',
  bgInput: '#F1F5F9',
  bgSkeleton: '#E2E8F0',
  bgSkeletonHighlight: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',
  primary: '#7C3AED',
  primaryLight: '#8B5CF6',
  primaryBg: 'rgba(124,58,237,0.08)',
  accent: '#1F2937',
  accentBg: 'rgba(31,41,55,0.06)',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  inputBorder: '#CBD5E1',
  inputBg: '#F8FAFC',
  inputPlaceholder: '#94A3B8',
  shadowColor: 'rgba(0,0,0,0.08)',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const darkTheme: ThemeColors = {
  mode: 'dark',
  bg: '#0B0F14',
  bgCard: '#1A1F2B',
  bgElevated: '#1A1F2B',
  bgHeader: '#4C1D95',
  bgTabBar: 'rgba(11,15,20,0.97)',
  bgTabBarBorder: 'rgba(255,255,255,0.08)',
  bgInput: '#1A1F2B',
  bgSkeleton: '#1A1F2B',
  bgSkeletonHighlight: '#2D3443',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  textInverse: '#0F172A',
  primary: '#A78BFA',
  primaryLight: '#C4B5FD',
  primaryBg: 'rgba(167,139,250,0.15)',
  accent: '#9CA3AF',
  accentBg: 'rgba(156,163,175,0.10)',
  border: 'rgba(255,255,255,0.10)',
  borderLight: 'rgba(255,255,255,0.06)',
  inputBorder: '#2D3443',
  inputBg: '#1A1F2B',
  inputPlaceholder: '#64748B',
  shadowColor: 'rgba(0,0,0,0.50)',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
};

export const { ThemeProvider, useTheme } = createThemeProvider<ThemeColors>({
  storageKey: THEME_STORAGE_KEY,
  storage: {
    getItem: (key) => SecureStore.getItemAsync(key).then((v) => v ?? null),
    setItem: (key, val) => SecureStore.setItemAsync(key, val),
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
