import { StyleSheet } from 'react-native';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

export const notificationStyles = StyleSheet.create({
  container: { flex: 1 },

  actionsRow: { flexDirection: 'row', gap: wp(10), marginBottom: hp(14), flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: wp(6), paddingHorizontal: wp(14), paddingVertical: hp(8), borderRadius: radius.lg },
  actionBtnText: { fontSize: fontSize.xs, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(20) },
  scrollContentEmpty: { flexGrow: 1, justifyContent: 'center' },

  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(12),
    padding: wp(16), borderRadius: radius.xl, marginBottom: hp(10),
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2, position: 'relative',
  },
  unreadDot: { position: 'absolute', top: hp(8), right: wp(8) },
  notifIcon: { width: ms(42), height: ms(42), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center', marginTop: hp(2), overflow: 'hidden' },
  notifLogoImg: { width: ms(42), height: ms(42), borderRadius: ms(14) },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: fontSize.md, marginBottom: hp(4) },
  notifBody: { fontSize: fontSize.sm, lineHeight: ms(20) },
  notifMeta: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginTop: hp(6) },
  notifMerchant: { fontSize: fontSize.xs, fontWeight: '600' },
  notifOfficialBadge: { fontWeight: '700', letterSpacing: 0.3 },
  notifDate: { fontSize: fontSize.xs },

  swipeBackground: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#EF4444', borderRadius: radius.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: wp(24), marginBottom: hp(10),
  },
  swipeAction: { alignItems: 'center', justifyContent: 'center' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: hp(80) },
  emptyIcon: { width: ms(88), height: ms(88), borderRadius: ms(24), alignItems: 'center', justifyContent: 'center', marginBottom: hp(20) },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', marginBottom: hp(8) },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(22) },

  pushBanner: { borderRadius: radius.xl, borderWidth: 1, padding: wp(14), marginBottom: hp(14) },
  pushBannerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: wp(10) },
  pushBannerIcon: { width: ms(38), height: ms(38), borderRadius: ms(12), alignItems: 'center', justifyContent: 'center' },
  pushBannerTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: hp(3) },
  pushBannerText: { fontSize: fontSize.xs, lineHeight: ms(18) },
  pushBannerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6), marginTop: hp(10), paddingVertical: hp(9), borderRadius: radius.lg },
  pushBannerBtnText: { fontSize: fontSize.sm, fontWeight: '700' },

  footerLoader: { paddingVertical: hp(16), alignItems: 'center' },
  footerSpacer: { height: hp(120) },

  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: radius.xl * 1.5, borderTopRightRadius: radius.xl * 1.5,
    paddingHorizontal: wp(24), paddingBottom: hp(36), paddingTop: hp(12), maxHeight: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 8,
  },
  modalHandle: { width: wp(40), height: hp(4), borderRadius: hp(2), alignSelf: 'center', marginBottom: hp(20) },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: wp(14), marginBottom: hp(20) },
  modalIcon: { width: ms(52), height: ms(52), borderRadius: ms(16), overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  modalLogoImg: { width: ms(52), height: ms(52), borderRadius: ms(16) },
  modalMerchant: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: hp(3) },
  modalDate: { fontSize: fontSize.xs },
  modalBody: { marginBottom: hp(24) },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', lineHeight: ms(28), marginBottom: hp(12) },
  modalBodyText: { fontSize: fontSize.md, lineHeight: ms(26) },
  modalCloseBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: hp(14), borderRadius: radius.lg },
  modalCloseBtnText: { fontSize: fontSize.md, fontWeight: '700' },
});
