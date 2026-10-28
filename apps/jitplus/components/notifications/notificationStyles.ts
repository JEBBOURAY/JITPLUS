import { StyleSheet } from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

export const CARD_GAP = hp(10);

export const notificationStyles = StyleSheet.create({
  container: { flex: 1 },

  // Header (sticky, mirrors the home screen header)
  header: {
    paddingHorizontal: wp(20), paddingBottom: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8), minHeight: ms(46) },
  titleBlock: { flex: 1 },
  title: { fontSize: fontSize['3xl'], letterSpacing: -0.6 },
  subtitle: { fontSize: fontSize.sm, marginTop: hp(1) },
  headerPill: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    height: ms(36), paddingHorizontal: wp(12), borderRadius: 999,
  },
  headerPillText: { fontSize: fontSize.xs },
  iconBtn: {
    width: ms(40), height: ms(40), borderRadius: ms(20), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Filter tabs
  filterRow: { flexDirection: 'row', gap: wp(8), marginTop: hp(12) },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    height: ms(34), paddingHorizontal: wp(14), borderRadius: 999, borderWidth: 1,
  },
  filterChipText: { fontSize: fontSize.xs },
  filterBadge: {
    minWidth: ms(18), height: ms(18), borderRadius: ms(9), paddingHorizontal: wp(5),
    alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { fontSize: ms(10), color: '#fff' },

  // List
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(16), paddingTop: hp(8), flexGrow: 1 },
  sectionHeader: {
    fontSize: fontSize.xs, letterSpacing: 0.6, textTransform: 'uppercase',
    marginTop: hp(14), marginBottom: hp(8), marginHorizontal: wp(4),
  },

  // Card
  cardRow: { marginBottom: CARD_GAP },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: wp(12),
    padding: wp(14), borderRadius: radius.xl, borderWidth: 1,
  },
  cardPressed: { transform: [{ scale: 0.985 }] },
  logoWrap: { width: ms(46), height: ms(46) },
  logo: { width: ms(46), height: ms(46), borderRadius: ms(14) },
  dealsLogo: { alignItems: 'center', justifyContent: 'center' },
  logoUnreadDot: {
    position: 'absolute', top: -ms(2), right: -ms(2),
    width: ms(13), height: ms(13), borderRadius: ms(7), borderWidth: 2,
  },
  cardContent: { flex: 1, minWidth: 0 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginBottom: hp(3) },
  senderRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: wp(4), minWidth: 0 },
  sender: { fontSize: fontSize.xs, flexShrink: 1 },
  time: { fontSize: ms(11) },
  cardTitle: { fontSize: fontSize.md, lineHeight: ms(21), letterSpacing: -0.2 },
  cardBody: { fontSize: fontSize.sm, lineHeight: ms(19), marginTop: hp(3) },

  // Swipe-to-dismiss background
  swipeBackground: {
    ...StyleSheet.absoluteFill, backgroundColor: palette.red, borderRadius: radius.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wp(22),
  },
  swipeAction: { alignItems: 'center', justifyContent: 'center', gap: hp(3) },
  swipeActionText: { color: '#fff', fontSize: ms(11) },

  // Push permission banner
  pushBanner: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    borderRadius: radius.xl, borderWidth: 1, padding: wp(14), marginTop: hp(6), marginBottom: hp(4),
  },
  pushBannerIcon: { width: ms(40), height: ms(40), borderRadius: ms(12), alignItems: 'center', justifyContent: 'center' },
  pushBannerTextWrap: { flex: 1 },
  pushBannerTitle: { fontSize: fontSize.sm, marginBottom: hp(2) },
  pushBannerText: { fontSize: fontSize.xs, lineHeight: ms(17) },
  pushBannerActions: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginTop: hp(10) },
  pushBannerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    height: ms(32), paddingHorizontal: wp(14), borderRadius: 999,
  },
  pushBannerBtnText: { fontSize: fontSize.xs, color: '#fff' },
  pushBannerLater: { fontSize: fontSize.xs, paddingHorizontal: wp(6) },

  // Skeleton
  skeletonCard: {
    flexDirection: 'row', gap: wp(12), padding: wp(14),
    borderRadius: radius.xl, borderWidth: 1, marginBottom: CARD_GAP,
  },

  // Empty / error
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(24), paddingVertical: hp(40) },
  emptyIcon: {
    width: ms(84), height: ms(84), borderRadius: ms(28),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(18),
  },
  emptyTitle: { fontSize: fontSize.lg, textAlign: 'center', letterSpacing: -0.2 },
  emptyHint: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20), marginTop: hp(6), maxWidth: wp(290) },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    height: ms(46), borderRadius: radius.lg, paddingHorizontal: wp(20), marginTop: hp(22),
  },
  emptyBtnText: { fontSize: fontSize.sm },

  // Footer
  footerLoader: { paddingVertical: hp(16), alignItems: 'center' },
  swipeHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6), marginTop: hp(10) },
  swipeHintText: { fontSize: ms(11), textAlign: 'center' },

  // Detail sheet
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.5)' },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85%',
    borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(22), paddingTop: hp(10),
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 16,
  },
  modalGrabZone: { paddingBottom: hp(6) },
  modalHandle: { width: wp(40), height: ms(5), borderRadius: ms(3), alignSelf: 'center', marginBottom: hp(16) },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  modalLogo: { width: ms(52), height: ms(52), borderRadius: ms(16) },
  modalHeaderText: { flex: 1, minWidth: 0 },
  modalSenderRow: { flexDirection: 'row', alignItems: 'center', gap: wp(5) },
  modalSender: { fontSize: fontSize.md, flexShrink: 1 },
  modalDate: { fontSize: fontSize.xs, marginTop: hp(2) },
  modalClose: { width: ms(34), height: ms(34), borderRadius: ms(17), alignItems: 'center', justifyContent: 'center' },
  modalDivider: { height: StyleSheet.hairlineWidth, marginTop: hp(16) },
  modalScroll: { flexGrow: 0 },
  modalScrollContent: { paddingTop: hp(16), paddingBottom: hp(8) },
  modalTitle: { fontSize: fontSize.xl, lineHeight: ms(28), letterSpacing: -0.3, marginBottom: hp(10) },
  modalBodyText: { fontSize: fontSize.md, lineHeight: ms(24) },
  modalActions: { flexDirection: 'row', gap: wp(10), paddingTop: hp(14) },
  modalDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6),
    height: ms(50), paddingHorizontal: wp(18), borderRadius: radius.lg, borderWidth: 1,
  },
  modalPrimaryBtn: { flex: 1, height: ms(50), borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: fontSize.md },
});
