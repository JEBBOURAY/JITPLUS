import { StyleSheet } from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

export const GRAD_START = { x: 0, y: 0 } as const;
export const GRAD_END_HORIZ = { x: 1, y: 0 } as const;
export const GRAD_END_DIAG = { x: 1, y: 1 } as const;
export const ACTIVE_COLORS: [string, string] = [palette.violet, palette.violetDark];
export const DISABLED_COLORS: [string, string] = ['#D4D0E8', '#C4BFD9'];
export const AVATAR_COLORS: [string, string] = [palette.gold, palette.violetVivid];

export const ICON_20 = ms(20);
export const ICON_18 = ms(18);
export const ICON_16 = ms(16);

export const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(24), paddingTop: hp(16), paddingBottom: hp(24), flexGrow: 1 },

  // Header
  header: { alignItems: 'center', marginBottom: hp(20) },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: ms(6), marginBottom: hp(20) },
  logo: { width: ms(32), height: ms(32) },

  // Step indicator
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(8) },
  stepGroup: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: ms(24), height: ms(24), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotInner: {
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: '#fff',
  },
  stepLine: { width: ms(40), height: 2, borderRadius: 1 },
  stepCounter: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '500', marginTop: hp(4) },

  // Card
  card: {
    borderRadius: radius['2xl'], padding: wp(24),
    shadowColor: '#000', shadowOffset: { width: 0, height: hp(4) },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 8,
  },

  // Step header
  stepHeader: { alignItems: 'center', marginBottom: hp(24) },
  stepIconCircle: {
    width: ms(52), height: ms(52), borderRadius: ms(26),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(14),
  },
  stepTitle: { fontSize: ms(22), fontWeight: '700', letterSpacing: -0.3, marginBottom: hp(6), textAlign: 'center' },
  stepSubtitle: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20), paddingHorizontal: wp(8) },

  // Avatar preview
  avatarRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    marginBottom: hp(20), paddingBottom: hp(16),
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  avatar: {
    width: ms(48), height: ms(48), borderRadius: ms(24),
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: fontSize.lg, fontWeight: '700', color: '#fff' },
  avatarName: { fontSize: fontSize.lg, fontWeight: '700', letterSpacing: -0.2 },
  avatarLabel: { fontSize: fontSize.xs, marginTop: hp(2) },

  // Fields
  field: { marginBottom: hp(16) },
  label: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: hp(8), marginLeft: wp(4) },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    borderRadius: radius.lg, borderWidth: 1.5,
    paddingHorizontal: wp(16), height: hp(54),
  },
  input: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },

  // Info box
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(10),
    paddingHorizontal: wp(14), paddingVertical: hp(12),
    borderRadius: radius.md, marginTop: hp(4), marginBottom: hp(4),
  },
  infoText: { flex: 1, fontSize: fontSize.xs, lineHeight: ms(18) },

  // Birthday card
  birthdayCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(12),
    padding: wp(16), borderRadius: radius.lg, borderWidth: 1,
    marginBottom: hp(12),
  },
  birthdayTitle: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: hp(4) },
  birthdayDesc: { fontSize: fontSize.xs, lineHeight: ms(18) },

  // No password block
  noPasswordBlock: { alignItems: 'center', paddingVertical: hp(20) },
  noPasswordIcon: {
    width: ms(64), height: ms(64), borderRadius: ms(32),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(14),
  },
  noPasswordTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: hp(6) },
  noPasswordDesc: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20) },

  // Terms checkbox
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: wp(10), marginTop: hp(12) },
  checkbox: {
    width: ms(22), height: ms(22), borderRadius: ms(6),
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginTop: ms(1),
  },
  termsText: { flex: 1, fontSize: fontSize.sm, lineHeight: ms(20) },

  // Strength bar
  strengthRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    marginBottom: hp(16), paddingHorizontal: wp(4),
  },
  strengthTrack: {
    flex: 1, height: ms(4), borderRadius: ms(2),
    backgroundColor: '#E5E7EB', overflow: 'hidden',
  },
  strengthFill: { height: '100%', borderRadius: ms(2) },
  strengthLabel: { fontSize: fontSize.xs, fontWeight: '600' },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    paddingHorizontal: wp(24), paddingVertical: hp(12),
    borderTopWidth: 1,
  },
  backBtn: {
    width: ms(48), height: ms(48), borderRadius: ms(24),
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  backBtnPlaceholder: { width: ms(48) },
  mainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.xl, height: hp(52), gap: wp(8),
  },
  mainBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.3 },
});
