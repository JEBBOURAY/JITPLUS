import { Platform, StyleSheet } from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import { font } from '@/constants/design';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

/** Touch area around small buttons (icons, inline links). */
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

/** Layout shared by every block of the register screen (fields, labels, buttons). */
export const formStyles = StyleSheet.create({
  flex1: { flex: 1 },
  field: { marginBottom: hp(12) },
  label: { fontSize: fontSize.sm, marginBottom: hp(6), fontFamily: font.semibold },
  labelInline: { marginBottom: 0 },
  labelRow: { alignItems: 'center', gap: wp(6), marginBottom: hp(6) },
  inputRow: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: wp(14),
    height: hp(48),
    gap: wp(10),
  },
  input: { flex: 1, fontSize: fontSize.md, fontFamily: font.medium },
  // "Already used" message under the e-mail / phone field.
  takenText: { flexShrink: 1, fontSize: fontSize.xs, lineHeight: ms(16), fontFamily: font.medium },
  errorHint: { fontSize: fontSize.xs, marginTop: hp(6), lineHeight: ms(16), fontFamily: font.regular },
  iconBtn: {
    width: ms(36),
    height: ms(36),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: palette.charbon,
    borderColor: palette.charbon,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  secondaryBtn: { backgroundColor: `${palette.charbon}0D`, borderColor: `${palette.charbon}28` },
  secondaryBtnText: { color: palette.charbon },
  // Bottom-sheet style pickers (category, language).
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: wp(18) },
  pickerSheet: { borderRadius: radius['2xl'], padding: wp(16), maxHeight: hp(560) },
  pickerTitle: { fontSize: ms(16), fontFamily: font.semibold, marginBottom: hp(10) },
  pickerRow: { alignItems: 'center', gap: wp(10), paddingVertical: hp(12), paddingHorizontal: wp(12), borderRadius: radius.md },
  pickerRowText: { flex: 1, fontSize: ms(14), fontFamily: font.medium },
});
