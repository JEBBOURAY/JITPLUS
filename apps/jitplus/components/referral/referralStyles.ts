import { StyleSheet, Platform } from 'react-native';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { palette } from '@/contexts/ThemeContext';

export const referralStyles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wp(16), paddingVertical: hp(12) },
  headerRTL: { flexDirection: 'row-reverse' },
  headerTitle: { fontSize: FS.lg, fontWeight: '700' },
  scrollContent: { paddingHorizontal: wp(16), paddingBottom: hp(40) },

  balanceCard: { borderRadius: radius.xl, padding: wp(20), alignItems: 'center', marginBottom: hp(16) },
  balanceLabel: { fontSize: FS.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginBottom: hp(4) },
  balanceAmount: { fontSize: ms(32), fontWeight: '800', color: '#fff', marginBottom: hp(6) },
  balanceHint: { fontSize: FS.xs, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  codeCard: {
    borderRadius: radius.xl, padding: wp(20), alignItems: 'center', marginBottom: hp(20),
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  codeLabel: { fontSize: FS.sm, fontWeight: '500', marginBottom: hp(8) },
  codeValue: { fontSize: ms(26), fontWeight: '800', letterSpacing: 2, marginBottom: hp(16) },
  codeActions: { flexDirection: 'row', gap: wp(12) },
  codeActionsRTL: { flexDirection: 'row-reverse' },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: wp(6), paddingHorizontal: wp(14), paddingVertical: hp(10), borderRadius: radius.lg },
  codeBtnText: { fontSize: FS.sm, fontWeight: '600' },

  listSection: { marginBottom: hp(20) },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginBottom: hp(12) },
  listHeaderRTL: { flexDirection: 'row-reverse' },
  listTitle: { fontSize: FS.md, fontWeight: '700' },
  listCard: {
    borderRadius: radius.xl, overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  emptyCard: {
    borderRadius: radius.xl, padding: wp(32), alignItems: 'center', gap: hp(10),
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  emptyTitle: { fontSize: FS.md, fontWeight: '600' },
  emptyDesc: { fontSize: FS.sm, textAlign: 'center' },

  referralRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: wp(16), paddingVertical: hp(14), gap: wp(10), borderBottomWidth: 0.5 },
  referralRowRTL: { flexDirection: 'row-reverse' },
  statusDot: { width: ms(8), height: ms(8), borderRadius: ms(4) },
  referralInfo: { flex: 1 },
  referralName: { fontSize: FS.md, fontWeight: '500' },
  referralMeta: { fontSize: FS.xs, marginTop: hp(2) },
  textRTL: { textAlign: 'right' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: wp(4), paddingHorizontal: wp(8), paddingVertical: hp(4), borderRadius: radius.md },
  statusText: { fontSize: FS.xs, fontWeight: '600' },

  contactCard: {
    borderRadius: radius.xl, padding: wp(20), marginBottom: hp(20), alignItems: 'center',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  contactText: { fontSize: FS.sm, lineHeight: ms(20), textAlign: 'center', marginBottom: hp(14) },
  contactActions: { flexDirection: 'row', gap: wp(12) },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: wp(6), paddingHorizontal: wp(16), paddingVertical: hp(10), borderRadius: radius.lg },
  contactBtnText: { fontSize: FS.sm, fontWeight: '600' },

  howCard: {
    borderRadius: radius.xl, padding: wp(20), marginBottom: hp(20),
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  howTitle: { fontSize: FS.md, fontWeight: '700', marginBottom: hp(16) },
  howStep: { flexDirection: 'row', gap: wp(12), paddingBottom: hp(14), marginBottom: hp(14), borderBottomWidth: 0.5, borderBottomColor: 'rgba(128,128,128,0.15)' },
  howStepRTL: { flexDirection: 'row-reverse' },
  howStepIcon: { width: ms(40), height: ms(40), borderRadius: ms(12), alignItems: 'center', justifyContent: 'center' },
  howStepNumber: { position: 'absolute', top: -ms(4), right: -ms(4), width: ms(16), height: ms(16), borderRadius: ms(8), backgroundColor: palette.violet, alignItems: 'center', justifyContent: 'center' },
  howStepNumberText: { fontSize: ms(9), fontWeight: '800', color: '#fff' },
  howStepContent: { flex: 1 },
  howStepTitle: { fontSize: FS.sm, fontWeight: '600', marginBottom: hp(3) },
  howStepDesc: { fontSize: FS.xs, lineHeight: ms(17) },
});
