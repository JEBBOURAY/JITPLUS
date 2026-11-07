import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { fontSize } from '@/utils/responsive';

/**
 * Only these four Lexend files are loaded (app/_layout.tsx). Never combine a
 * family with `fontWeight`: Android then synthesizes a fake bold or falls back
 * to the system font.
 */
export const font = {
  regular: 'Lexend_400Regular',
  medium: 'Lexend_500Medium',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
} as const;

export const typography = {
  title: { fontFamily: font.bold, fontSize: fontSize.xl, letterSpacing: -0.3 },
} satisfies Record<string, TextStyle>;

/** Neutral shadows only: coloured glows read as decoration, not depth. */
export const shadow = {
  sm: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    default: { elevation: 1 },
  }),
} as const;

export const icon = {
  stroke: 1.75,
  strokeSmall: 2,
  sm: 16,
  md: 20,
  lg: 24,
} as const;
