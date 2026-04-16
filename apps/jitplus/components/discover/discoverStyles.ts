import { StyleSheet } from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';

// ── Premium shadow tokens ──
const SHADOW_PREMIUM = {
  shadowColor: palette.violet, shadowOpacity: 0.10,
  shadowOffset: { width: 0, height: hp(3) }, shadowRadius: 16, elevation: 4,
};
const SHADOW_LIGHT = {
  shadowColor: '#000', shadowOpacity: 0.04,
  shadowOffset: { width: 0, height: hp(1) }, shadowRadius: 8, elevation: 2,
};

export const discoverStyles = StyleSheet.create({
  container: { flex: 1 },

  // Top bar
  topBar: { position: 'absolute', left: 0, right: 0, paddingHorizontal: wp(16), zIndex: 10 },
  topButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floatingBtn: {
    width: ms(48), height: ms(48), borderRadius: ms(24),
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM,
  },
  counterBadge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    backgroundColor: '#fff', paddingHorizontal: wp(16), paddingVertical: hp(10),
    borderRadius: ms(24), borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM,
  },
  counterText: { fontSize: FS.sm, fontWeight: '700', color: '#1e293b' },
  filterDot: {
    position: 'absolute', top: ms(8), right: ms(8),
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: palette.violet, borderWidth: 1.5, borderColor: '#fff',
  },

  // Search
  searchBarExpanded: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: ms(28), paddingHorizontal: wp(18), height: ms(52), gap: wp(10),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.08)', ...SHADOW_PREMIUM,
  },
  searchInput: { flex: 1, fontSize: FS.md, color: '#1e293b', paddingVertical: 0 },
  closePill: {
    width: ms(30), height: ms(30), borderRadius: ms(15),
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },

  // Filters
  filterBar: { position: 'absolute', left: 0, right: 0, zIndex: 9 },
  filterScroll: { paddingHorizontal: wp(16), paddingVertical: hp(4), gap: wp(6) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5),
    paddingHorizontal: wp(14), paddingVertical: hp(8),
    borderRadius: ms(20), borderWidth: 1, marginRight: wp(2), ...SHADOW_LIGHT,
  },
  chipLabel: { fontSize: FS.xs, fontWeight: '600' },

  // Merchant logos (callout + fallback)
  merchantLogo: { width: ms(38), height: ms(38), borderRadius: ms(10) },
  fallbackLogo: { width: ms(34), height: ms(34), borderRadius: ms(10) },

  // Locate
  locateBtn: {
    position: 'absolute', right: wp(16),
    width: ms(48), height: ms(48), borderRadius: ms(24),
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM, zIndex: 10,
  },

  // Callout
  calloutWrapper: {
    position: 'absolute', left: wp(16), right: wp(16), zIndex: 10,
  },
  calloutCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: ms(22), padding: wp(14),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.08)',
    overflow: 'hidden', ...SHADOW_PREMIUM,
  },
  calloutAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: ms(4), borderTopLeftRadius: ms(22), borderBottomLeftRadius: ms(22),
    backgroundColor: palette.violet,
  },
  calloutAvatar: {
    width: ms(56), height: ms(56), borderRadius: ms(16),
    alignItems: 'center', justifyContent: 'center', marginRight: wp(12), overflow: 'hidden',
  },
  calloutInfo: { flex: 1 },
  calloutName: { fontSize: FS.lg, fontWeight: '700', color: '#1e293b', letterSpacing: -0.3 },
  calloutActions: { alignItems: 'center', gap: hp(8), marginStart: wp(8) },
  calloutDistRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(3), marginTop: hp(4),
    backgroundColor: 'rgba(124,58,237,0.06)', alignSelf: 'flex-start',
    paddingHorizontal: wp(8), paddingVertical: hp(2), borderRadius: ms(8),
  },
  calloutDist: {
    fontSize: FS.xs, fontWeight: '700', color: palette.violet, letterSpacing: 0.2,
  },
  navBtn: {
    width: ms(42), height: ms(42), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center',
  },
  catBadge: { alignSelf: 'flex-start', paddingHorizontal: wp(8), paddingVertical: hp(2), borderRadius: radius.sm },
  catBadgeText: { fontSize: ms(11), fontWeight: '600' },

  // Empty
  emptyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  emptyCard: {
    alignItems: 'center', backgroundColor: '#fff',
    padding: wp(28), borderRadius: radius['2xl'], marginHorizontal: wp(40),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_PREMIUM,
  },
  emptyState: { alignItems: 'center', paddingTop: hp(60) },
  emptyTitle: { fontSize: FS.lg, fontWeight: '700', color: '#334155', marginTop: hp(12) },
  emptyText: { fontSize: FS.sm, color: '#94a3b8', textAlign: 'center', marginTop: hp(6), lineHeight: ms(20) },

  // Fallback
  fallbackList: { paddingHorizontal: wp(16) },
  fallbackCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: ms(18), padding: wp(14), marginBottom: hp(10),
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)', ...SHADOW_LIGHT,
  },
  fallbackAvatar: {
    width: ms(50), height: ms(50), borderRadius: ms(16),
    alignItems: 'center', justifyContent: 'center', marginRight: wp(12), overflow: 'hidden',
  },
  fallbackName: { fontSize: FS.md, fontWeight: '700', color: '#1e293b', marginBottom: hp(2) },
  fallbackAddr: { fontSize: FS.xs, color: '#94a3b8' },
  fallbackNavBtn: {
    width: ms(40), height: ms(40), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center', marginLeft: wp(8),
  },
});
