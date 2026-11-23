import { Platform, StyleSheet } from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import { fontSize, ms, radius, wp } from '@/utils/responsive';

export const shadowSm = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  default: { elevation: 2 },
});

/** Fields and buttons shared by the sign-in screens (JitPlus Pro look). */
export const authStyles = StyleSheet.create({
  inputWrapper: {
    flexDirection: 'row', minHeight: ms(52), borderRadius: radius.md, borderWidth: 1.5,
    paddingHorizontal: wp(14), alignItems: 'center', gap: wp(10),
  },
  inputField: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  primaryBtn: {
    flexDirection: 'row', minHeight: ms(54), borderRadius: radius.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: wp(8),
  },
  primaryActive: { backgroundColor: palette.violet, borderColor: palette.violet, ...shadowSm },
  primaryText: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
});
