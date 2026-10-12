import { StyleSheet } from 'react-native';
import { hp, ms, fontSize as FS, radius } from '@/utils/responsive';

/** Shared styles for the profile modals (delete account, language, OTP). */
const modalCardBase = {
  width: '100%' as const,
  borderRadius: ms(20),
  padding: ms(24),
  alignItems: 'center' as const,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 16,
  elevation: 6,
};

export const profileStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: ms(24),
  },
  modalCard: modalCardBase,
  modalIconCircle: {
    width: ms(44),
    height: ms(44),
    borderRadius: ms(14),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(12),
  },
  modalTitle: { fontSize: ms(18), fontWeight: '700', marginBottom: hp(8), textAlign: 'center' },
  modalBody: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(20), marginBottom: hp(16) },
  modalInstruction: { fontSize: ms(13), marginBottom: hp(8), textAlign: 'center' },
  modalInput: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: ms(12),
    paddingHorizontal: ms(14),
    paddingVertical: hp(10),
    fontSize: ms(16),
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: hp(16),
  },
  modalActions: { flexDirection: 'row', gap: ms(12), width: '100%' },
  modalBtn: { flex: 1, paddingVertical: hp(12), borderRadius: ms(12), alignItems: 'center' },
  modalBtnText: { fontSize: ms(14), fontWeight: '700' },

  /* ── Language selector ── */
  langModalCard: modalCardBase,
  langModalDesc: { fontSize: ms(13), textAlign: 'center', marginBottom: hp(16) },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: ms(14),
    borderRadius: ms(14),
    borderWidth: 1.5,
    marginBottom: hp(10),
    gap: ms(12),
  },
  langFlag: { fontSize: ms(22) },
  langOptionText: { flex: 1, fontSize: FS.md, fontWeight: '600' },
  langCheck: { width: ms(22), height: ms(22), borderRadius: ms(11), alignItems: 'center', justifyContent: 'center' },

  /* ── OTP verification modal ── */
  otpModalCard: modalCardBase,
  otpModalDesc: { fontSize: ms(13), textAlign: 'center', marginBottom: hp(16) },
  otpInput: {
    width: '100%',
    fontSize: FS.xl,
    fontWeight: '700',
    letterSpacing: ms(8),
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingVertical: hp(14),
    paddingHorizontal: ms(16),
  },
  otpErrorText: { fontSize: FS.xs, marginTop: hp(6), textAlign: 'center' },
  otpResendRow: { marginTop: hp(12), marginBottom: hp(16), alignItems: 'center' },
  otpResendText: { fontSize: FS.sm, fontWeight: '600' },
});
