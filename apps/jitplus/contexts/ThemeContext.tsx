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
  // Semantic aliases
  neonBlue: '#38BDF8',
  emerald: '#10B981',
  red: '#EF4444',
  // Neutral spectrum
  white: '#FFFFFF',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray900: '#0F172A',
};


export interface ThemeColors {
  mode: 'light' | 'dark';
  bg: string;
  bgCard: string;
  bgElevated: string;
  bgTabBar: string;
  bgTabBarBorder: string;
  bgInput: string;
  bgSkeleton: string;
  bgSkeletonHighlight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  primaryBg: string;
  accent: string;
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

// Graphite ramp: surfaces stay grey so the merchants' cards carry the colour.
const lightTheme: ThemeColors = {
  mode: 'light',
  bg: '#FAFAFA',
  bgCard: '#FFFFFF',
  bgElevated: '#FFFFFF',
  bgTabBar: 'rgba(255,255,255,0.97)',
  bgTabBarBorder: 'rgba(23,23,23,0.08)',
  bgInput: '#F4F4F5',
  bgSkeleton: '#F0F0F1',
  bgSkeletonHighlight: '#FAFAFA',
  text: '#171717',
  textSecondary: '#525252',
  textMuted: '#737373',
  primary: '#7C3AED',
  primaryLight: '#8B5CF6',
  primaryBg: 'rgba(124,58,237,0.06)',
  // Gold marks what the client earns: a reward ready, a stamp received.
  accent: '#B7791F',
  border: 'rgba(23,23,23,0.10)',
  borderLight: 'rgba(23,23,23,0.06)',
  inputBorder: 'rgba(23,23,23,0.14)',
  inputBg: '#F4F4F5',
  inputPlaceholder: '#A3A3A3',
  shadowColor: 'rgba(0,0,0,0.06)',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
};

const darkTheme: ThemeColors = {
  mode: 'dark',
  bg: '#141415',
  bgCard: '#19191B',
  bgElevated: '#232325',
  bgTabBar: 'rgba(20,20,21,0.97)',
  bgTabBarBorder: 'rgba(237,237,237,0.08)',
  bgInput: '#232325',
  bgSkeleton: '#232325',
  bgSkeletonHighlight: '#2E2E31',
  text: '#EDEDED',
  textSecondary: '#A1A1A6',
  textMuted: '#85858B',
  primary: '#A78BFA',
  primaryLight: '#C4B5FD',
  primaryBg: 'rgba(167,139,250,0.14)',
  accent: '#F5B544',
  border: 'rgba(237,237,237,0.10)',
  borderLight: 'rgba(237,237,237,0.06)',
  inputBorder: 'rgba(237,237,237,0.14)',
  inputBg: '#19191B',
  inputPlaceholder: '#6E6E73',
  shadowColor: 'rgba(0,0,0,0.40)',
  success: '#4CC38A',
  warning: '#F5A524',
  danger: '#E5484D',
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
