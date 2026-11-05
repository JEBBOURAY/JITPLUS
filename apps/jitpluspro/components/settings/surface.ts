import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { font } from '@/constants/design';

/** Light elevation used instead of borders for every loyalty-settings surface. */
export function surfaceShadow(theme: ThemeColors) {
  return theme.mode === 'dark'
    ? null
    : { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 };
}

export function fieldFill(theme: ThemeColors) {
  return theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : theme.bgInput;
}

/** Card panel shared by the loyalty-rules and gifts sections. */
export const panelStyles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginTop: 18, borderRadius: 16 },
  header: { alignItems: 'center', gap: 11, paddingTop: 16, paddingHorizontal: 16 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },
  body: { padding: 16, paddingTop: 14 },
});
