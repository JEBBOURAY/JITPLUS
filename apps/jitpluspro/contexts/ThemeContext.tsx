import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createThemeProvider } from '@jitplus/shared/src/createThemeProvider';

const THEME_STORAGE_KEY = 'jitplus_theme_mode';

export const palette = {
  // Primary violet spectrum
  violet: '#7C3AED',
  violetLight: '#A78BFA',
  violetDark: '#5B21B6',
  violetDeep: '#4C1D95',
  violetVivid: '#8B5CF6',
  // Charbon Pro accent spectrum
  charbon: '#1F2937',
  charbonDark: '#111827',
  charbonSoft: '#4B5563',
  charbonUltraLight: '#9CA3AF',
  // Premium dark surface
  premiumBg: '#0f031e',
  premiumBgMid: '#1a0533',
  premiumBorder: '#7C3AED30',
  premiumBadgeBg: '#7C3AED28',
  premiumBadgeBorder: '#7C3AED55',
  // Brass rather than bright yellow: reads premium on violet, keeps dark text legible.
  gold: '#D4A64A',
  goldDeep: '#A87B2D',
  // Secondary text and icons on the violet Accueil hero.
  heroMuted: 'rgba(255,255,255,0.65)',
  // Aliases kept for compat
  cyan: '#6B7280',
  // Neutral spectrum
  white: '#FFFFFF',
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
  bgInput: string;
  bgSkeleton: string;
  bgSkeletonHighlight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryBg: string;
  accent: string;
  border: string;
  borderLight: string;
  inputBorder: string;
  inputBg: string;
  inputPlaceholder: string;
  success: string;
  warning: string;
  danger: string;
}

// Graphite ramp: surfaces stay grey so the stamp card and the figures carry the colour.
const lightTheme: ThemeColors = {
  mode: 'light',
  bg: '#FAFAFA',
  bgCard: '#FFFFFF',
  bgElevated: '#F4F4F5',
  bgInput: '#F4F4F5',
  bgSkeleton: 'rgba(23,23,23,0.06)',
  bgSkeletonHighlight: 'rgba(255,255,255,0.90)',
  text: '#171717',
  textSecondary: '#525252',
  textMuted: '#737373',
  textInverse: '#FFFFFF',
  primary: '#7C3AED',
  primaryBg: 'rgba(124,58,237,0.08)',
  accent: '#1F2937',
  border: 'rgba(23,23,23,0.10)',
  borderLight: 'rgba(23,23,23,0.06)',
  inputBorder: 'rgba(23,23,23,0.14)',
  inputBg: '#FFFFFF',
  inputPlaceholder: '#A3A3A3',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
};

const darkTheme: ThemeColors = {
  mode: 'dark',
  bg: '#141415',
  bgCard: '#19191B',
  bgElevated: '#232325',
  bgInput: '#232325',
  bgSkeleton: 'rgba(237,237,237,0.06)',
  bgSkeletonHighlight: 'rgba(237,237,237,0.14)',
  text: '#EDEDED',
  textSecondary: '#A1A1A6',
  textMuted: '#85858B',
  textInverse: '#141415',
  primary: '#A78BFA',
  primaryBg: 'rgba(167,139,250,0.14)',
  accent: '#A1A1A6',
  border: 'rgba(237,237,237,0.10)',
  borderLight: 'rgba(237,237,237,0.06)',
  inputBorder: 'rgba(237,237,237,0.14)',
  inputBg: '#19191B',
  inputPlaceholder: '#6E6E73',
  success: '#4CC38A',
  warning: '#F5A524',
  danger: '#E5484D',
};

export const { ThemeProvider, useTheme } = createThemeProvider<ThemeColors>({
  storageKey: THEME_STORAGE_KEY,
  defaultMode: 'light',
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
