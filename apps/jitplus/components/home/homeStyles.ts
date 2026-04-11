import { StyleSheet } from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

export const homeStyles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { paddingBottom: hp(24), borderBottomLeftRadius: ms(28), borderBottomRightRadius: ms(28) },
  headerContent: { paddingHorizontal: wp(24), paddingTop: hp(8) },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: '700', color: '#fff', letterSpacing: -0.3 },

  // Content
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(20), flexGrow: 1, justifyContent: 'center' },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    padding: wp(14), borderRadius: radius.md, borderWidth: 1, marginBottom: hp(20),
  },
  errorBannerText: { fontSize: fontSize.sm, fontWeight: '600', flex: 1 },

  // Cards
  cardsSection: {},
  cardItem: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, padding: wp(14), paddingLeft: wp(10), marginBottom: hp(12),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    overflow: 'hidden' as const,
  },
  accentBar: {
    position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: ms(4),
    borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg,
  },
  cardIcon: { width: ms(50), height: ms(50), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center', marginLeft: wp(4), marginRight: wp(14), overflow: 'hidden' as const },
  cardEmoji: { fontSize: ms(22) },
  merchantLogo: { width: ms(50), height: ms(50), borderRadius: ms(14) },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: hp(4) },
  cardName: { fontSize: fontSize.md, fontWeight: '700', letterSpacing: -0.2, flex: 1 },
  cardLogo: { width: ms(18), height: ms(18), marginLeft: wp(6), opacity: 0.4 },
  cardProgress: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(6), flexWrap: 'wrap' as const },
  cardPoints: { fontSize: fontSize.sm, fontWeight: '700' },
  progressBar: { height: ms(4), borderRadius: ms(2), flex: 1, minWidth: wp(40), maxWidth: wp(80), overflow: 'hidden' as const },
  progressFill: { height: '100%' as const, borderRadius: ms(2) },
  cardRemaining: { fontSize: fontSize.xs, fontWeight: '500' },

  // ── Stamps grid ──
  stampsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: wp(4),
    marginTop: hp(4),
    marginBottom: hp(4),
  },
  stampDot: {
    width: ms(26), height: ms(26), borderRadius: ms(13),
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden' as const,
  },
  stampLogo: { width: '100%' as const, height: '100%' as const, borderRadius: ms(12) },
  stampCheck: { color: '#fff', fontSize: ms(12), fontWeight: '700' },
  stampsExtra: { fontSize: fontSize.xs, fontWeight: '600', alignSelf: 'center' as const },
  stampsMeta: { fontSize: fontSize.xs, fontWeight: '500', marginTop: hp(1) },

  // ── Points bar ──
  pointsTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: hp(4),
    marginBottom: hp(5),
  },
  pointsValueRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(4) },
  pointsValue: { fontSize: fontSize.sm, fontWeight: '700' },
  pointsPct: { fontSize: fontSize.xs, fontWeight: '600' },
  pointsBar: { height: ms(7), borderRadius: ms(4), overflow: 'hidden' as const, marginBottom: hp(4) },
  pointsBarFill: { width: '100%' as const, height: '100%' as const, borderRadius: ms(4) },
  pointsTargetLabel: { fontSize: fontSize.xs, fontWeight: '500' },

  // ── Shared reward indicators ──
  rewardBanner: {
    marginTop: hp(4),
    paddingVertical: hp(4), paddingHorizontal: wp(10),
    borderRadius: ms(8), alignSelf: 'flex-start' as const,
  },
  rewardBannerText: { fontSize: fontSize.xs, fontWeight: '700' },
  rewardBadge: {
    paddingVertical: hp(2), paddingHorizontal: wp(8),
    borderRadius: ms(8),
  },
  rewardBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  unavailableBanner: {
    marginTop: hp(4),
    paddingVertical: hp(5),
    paddingHorizontal: wp(10),
    borderRadius: ms(8),
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(6),
  },
  unavailableText: { fontSize: fontSize.xs, fontWeight: '600' },

  // Empty
  emptyCards: {
    borderRadius: radius.xl, padding: wp(32), alignItems: 'center', gap: hp(8),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 2,
  },
  emptyIcon: {
    width: ms(64), height: ms(64), borderRadius: ms(32),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(4),
  },
  emptyText: { fontSize: fontSize.md, fontWeight: '600' },
  emptyHint: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20) },

  // Welcome
  welcomeBanner: {
    marginHorizontal: wp(20), marginTop: -hp(8), marginBottom: hp(8),
    borderRadius: radius.lg, overflow: 'hidden',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 3,
  },
  welcomeGradient: { flexDirection: 'row', alignItems: 'center', gap: wp(10), paddingVertical: hp(14), paddingHorizontal: wp(20) },
  welcomeText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2 },

  // Filter chips (sort — inline)
  filterScroll: { marginBottom: hp(14) },
  filterRow: { flexDirection: 'row', gap: wp(8), paddingVertical: hp(2) },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(16), paddingVertical: hp(8),
    borderRadius: ms(20), borderWidth: 1,
  },
  filterChipText: { fontSize: fontSize.sm, fontWeight: '600' },

  // ── Floating top bar (discover-style) ──
  topBar: { position: 'absolute', left: 0, right: 0, paddingHorizontal: wp(16), zIndex: 10 },
  topButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floatingBtn: {
    width: ms(46), height: ms(46), borderRadius: ms(23),
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 12, elevation: 3,
  },
  counterBadge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(14), paddingVertical: hp(8),
    borderRadius: ms(20),
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 8, elevation: 3,
  },
  counterText: { fontSize: fontSize.sm, fontWeight: '700' },
  filterDot: {
    position: 'absolute', top: ms(8), right: ms(8),
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: '#FFFFFF',
  },

  // Search bar expanded
  searchBarExpanded: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: ms(25), paddingHorizontal: wp(16), height: ms(50), gap: wp(10),
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 12, elevation: 3,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: 0 },
  closePill: {
    width: ms(28), height: ms(28), borderRadius: ms(14),
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },

  // Floating filter bar (category chips)
  floatingFilterBar: { position: 'absolute', left: 0, right: 0, zIndex: 9 },
  floatingFilterScroll: { paddingHorizontal: wp(16), paddingVertical: hp(4), gap: wp(6) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5),
    paddingHorizontal: wp(16), paddingVertical: hp(8),
    borderRadius: ms(18), borderWidth: 1, marginRight: wp(2),
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 8, elevation: 2,
  },
  chipLabel: { fontSize: fontSize.xs, fontWeight: '600' },

  // ── Closest badge ──
  closestBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(4),
    paddingHorizontal: wp(8),
    paddingVertical: hp(3),
    borderRadius: ms(8),
    alignSelf: 'flex-start' as const,
    marginTop: hp(2),
    marginBottom: hp(3),
  },
  closestBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  // ── Last scan ──
  lastScanText: { fontSize: fontSize.xs, fontWeight: '500', marginTop: hp(3), opacity: 0.75 },

  // ── Reward notification banner ──
  rewardNotifBanner: {
    position: 'absolute',
    left: wp(16),
    right: wp(16),
    zIndex: 20,
  },
  rewardNotifGradient: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(10),
    paddingVertical: hp(12),
    paddingHorizontal: wp(16),
    borderRadius: radius.lg,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  rewardNotifText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', flex: 1 },
});
