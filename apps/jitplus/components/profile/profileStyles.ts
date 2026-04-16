import { StyleSheet } from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';

export const profileStyles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { paddingBottom: hp(24), borderBottomLeftRadius: ms(28), borderBottomRightRadius: ms(28) },
  headerContent: { paddingHorizontal: wp(24), paddingTop: hp(8) },
  headerTitle: { fontSize: FS['2xl'], fontWeight: '700', color: '#fff', letterSpacing: -0.3 },

  // Profile card
  profileCard: {
    padding: wp(16), marginBottom: hp(16),
  },
  profileRow: { alignItems: 'center', gap: hp(8) },
  avatarGradient: {
    width: ms(56), height: ms(56), borderRadius: ms(28),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FS.lg, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  profileInfo: { alignItems: 'center' },
  profileName: { fontSize: FS.lg, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  editHeaderBtn: {
    width: ms(38), height: ms(38), borderRadius: ms(19),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${palette.violet}20`,
  },

  // Referral banner
  referralBanner: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: hp(16),
  },
  referralBannerGradient: {
    borderRadius: radius.xl,
    padding: wp(16),
  },
  referralBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(12),
  },
  referralBannerIconWrap: {
    width: ms(42),
    height: ms(42),
    borderRadius: ms(21),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralBannerTextWrap: {
    flex: 1,
  },
  referralBannerTitle: {
    fontSize: FS.md,
    fontWeight: '700',
    color: '#fff',
    marginBottom: hp(3),
  },
  referralBannerDesc: {
    fontSize: FS.xs,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: ms(17),
  },

  // Content
  contentContainer: { paddingHorizontal: wp(20), paddingTop: hp(40), paddingBottom: hp(120), flexGrow: 1, justifyContent: 'center' },

  // Section
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: hp(8), marginTop: hp(8),
  },
  sectionTitle: {
    fontSize: FS.xs, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: hp(8), marginLeft: wp(4), marginTop: hp(8),
  },
  editActions: { flexDirection: 'row', gap: wp(8) },
  editActionBtn: {
    width: ms(34), height: ms(34), borderRadius: ms(17),
    alignItems: 'center', justifyContent: 'center',
  },

  // Info card
  infoCard: {
    borderRadius: radius.xl, overflow: 'hidden', marginBottom: hp(16),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: wp(16), paddingVertical: hp(14), gap: wp(12),
    borderBottomWidth: 0.5,
  },
  infoIconBox: {
    width: ms(36), height: ms(36), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: FS.xs, marginBottom: hp(2) },
  infoValue: { fontSize: FS.md, fontWeight: '500' },
  infoInput: {
    fontSize: FS.md, fontWeight: '500', paddingVertical: hp(2),
    borderBottomWidth: 1.5, marginTop: hp(2),
  },

  // Delete
  deleteCard: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    padding: wp(16), borderRadius: radius.xl, borderWidth: 1, marginBottom: hp(16),
  },
  deleteIcon: {
    width: ms(44), height: ms(44), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center',
  },
  deleteContent: { flex: 1 },
  deleteTitle: { fontSize: FS.md, fontWeight: '600', marginBottom: hp(2) },
  deleteDesc: { fontSize: FS.xs, lineHeight: ms(18) },

  // Logo footer
  logoFooter: { alignItems: 'center', paddingTop: hp(28), paddingBottom: hp(10) },
  logoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  logoImage: { width: ms(64), height: ms(64), borderRadius: ms(14) },
  logoSubtext: { fontSize: FS.xs, marginTop: hp(8), fontWeight: '500', letterSpacing: 0.3 },
  versionText: { fontSize: FS.xs, marginTop: hp(4), opacity: 0.5, fontWeight: '400' },

  // Toggle
  toggle: {
    width: ms(48), height: ms(28), borderRadius: ms(14),
    justifyContent: 'center', paddingHorizontal: ms(3),
  },
  toggleOn: {
    backgroundColor: palette.violet,
  },
  toggleKnob: {
    width: ms(22), height: ms(22), borderRadius: ms(11),
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end' as const,
  },

  /* ── Profile completion card ── */
  profileCompletionCard: {
    borderRadius: radius.lg,
    padding: wp(14),
    marginBottom: hp(14),
    borderWidth: 1,
  },
  profileCompletionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    marginBottom: hp(10),
  },
  profileCompletionBadge: {
    width: ms(30),
    height: ms(30),
    borderRadius: ms(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCompletionTextWrap: { flex: 1 },
  profileCompletionTitle: { fontSize: FS.md, fontWeight: '700' },
  profileCompletionHint: { fontSize: FS.xs, fontWeight: '500', marginTop: hp(3), lineHeight: ms(17) },
  profileCompletionPercent: { fontSize: FS.md, fontWeight: '800' },
  profileCompletionTrack: {
    height: ms(8),
    borderRadius: ms(4),
    overflow: 'hidden',
  },
  profileCompletionFill: { height: '100%', borderRadius: ms(4) },
  profileCompletionFooter: {
    marginTop: hp(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileCompletionCta: { fontSize: FS.xs, fontWeight: '700' },

  /* ── Delete Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: ms(24),
  },
  modalCard: {
    width: '100%',
    borderRadius: ms(20),
    padding: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  modalIconCircle: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(12),
  },
  modalTitle: {
    fontSize: ms(18),
    fontWeight: '700',
    marginBottom: hp(8),
  },
  modalBody: {
    fontSize: ms(14),
    textAlign: 'center',
    lineHeight: ms(20),
    marginBottom: hp(16),
  },
  modalInstruction: {
    fontSize: ms(13),
    marginBottom: hp(8),
    textAlign: 'center',
  },
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
  modalActions: {
    flexDirection: 'row',
    gap: ms(12),
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: hp(12),
    borderRadius: ms(12),
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: ms(14),
    fontWeight: '700',
  },

  /* ── Language selector ── */
  langBadge: {
    fontSize: FS.xs,
    fontWeight: '700',
    paddingHorizontal: ms(10),
    paddingVertical: hp(4),
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  langModalCard: {
    width: '100%',
    borderRadius: ms(20),
    padding: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  langModalDesc: {
    fontSize: ms(13),
    textAlign: 'center',
    marginBottom: hp(16),
  },
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
  langFlag: {
    fontSize: ms(22),
  },
  langOptionText: {
    flex: 1,
    fontSize: FS.md,
    fontWeight: '600',
  },
  langCheck: {
    width: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── OTP verification modal ── */
  otpModalCard: {
    width: '100%',
    borderRadius: ms(20),
    padding: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  otpModalDesc: {
    fontSize: ms(13),
    textAlign: 'center',
    marginBottom: hp(16),
  },
  otpInput: {
    width: '100%',
    fontSize: FS.xl,
    fontWeight: '700',
    letterSpacing: ms(8),
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingVertical: hp(14),
    paddingHorizontal: wp(16),
  },
  otpErrorText: {
    fontSize: FS.xs,
    marginTop: hp(6),
    textAlign: 'center',
  },
  otpResendRow: {
    marginTop: hp(12),
    marginBottom: hp(16),
    alignItems: 'center',
  },
  otpResendText: {
    fontSize: FS.sm,
    fontWeight: '600',
  },

  /* ── Pending verification badge ── */
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: wp(4),
    backgroundColor: `${palette.gold}15`,
    paddingHorizontal: wp(8),
    paddingVertical: hp(4),
    borderRadius: radius.md,
    marginTop: hp(4),
  },
  pendingBadgeText: {
    fontSize: ms(10),
    fontWeight: '700',
    color: palette.gold,
  },
});
