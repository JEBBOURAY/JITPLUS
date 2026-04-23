import { StyleSheet, Platform } from 'react-native';
import { wp, hp, ms } from '@/utils/responsive';
import { palette } from '@/contexts/ThemeContext';

export const merchantStyles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, paddingHorizontal: wp(20), paddingTop: hp(24), gap: hp(14), alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: wp(40) },
  errorIcon: { width: ms(64), height: ms(64), borderRadius: ms(32), alignItems: 'center', justifyContent: 'center', marginBottom: hp(16) },
  errorTitle: { fontSize: ms(20), fontWeight: '700', marginBottom: hp(8) },
  errorText: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(22), marginBottom: hp(24) },
  errorButton: { paddingHorizontal: wp(24), paddingVertical: hp(12), borderRadius: ms(14) },
  errorButtonText: { color: '#fff', fontSize: ms(15), fontWeight: '700' },
  scrollContent: { paddingBottom: hp(100) },

  // Hero
  heroSection: { position: 'relative' as const, height: hp(220), marginBottom: hp(40) },
  coverImage: { width: '100%', height: '100%' },
  coverFade: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: hp(80) },
  floatingHeader: {
    position: 'absolute' as const, top: 0, left: 0, right: 0,
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    paddingHorizontal: wp(16), paddingTop: hp(4),
  },
  floatingBtn: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    alignItems: 'center' as const, justifyContent: 'center' as const,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  logoContainer: {
    position: 'absolute' as const, bottom: -ms(40), alignSelf: 'center' as const,
    left: 0, right: 0, alignItems: 'center' as const,
  },
  logoRing: {
    width: ms(92), height: ms(92), borderRadius: ms(46),
    alignItems: 'center' as const, justifyContent: 'center' as const,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  logo: { width: ms(84), height: ms(84), borderRadius: ms(42) },
  emojiWrap: { width: ms(84), height: ms(84), borderRadius: ms(42), alignItems: 'center' as const, justifyContent: 'center' as const },
  emoji: { fontSize: ms(38) },

  // Identity
  identitySection: { alignItems: 'center' as const, paddingHorizontal: wp(20), paddingBottom: hp(20) },
  merchantName: { fontSize: ms(26), fontWeight: '800' as const, letterSpacing: -0.5, maxWidth: '92%', marginBottom: hp(8), textAlign: 'center' as const },
  categoryBadge: { paddingHorizontal: wp(14), paddingVertical: hp(5), borderRadius: ms(20), marginBottom: hp(14) },
  categoryText: { fontSize: ms(12), fontWeight: '600' as const },
  statsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(6) },
  statChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(6), borderRadius: ms(12), paddingHorizontal: wp(14), paddingVertical: hp(8) },
  statValue: { fontSize: ms(14), fontWeight: '800' as const },
  statLabel: { fontSize: ms(11), fontWeight: '500' as const },
  statDivider: { width: 1, height: ms(20), backgroundColor: '#00000010' },

  // Content
  contentArea: { paddingHorizontal: wp(16), gap: hp(12) },
  sectionTitle: { fontSize: ms(16), fontWeight: '700' as const, letterSpacing: -0.2, marginBottom: hp(8) },

  // Description
  descriptionCard: {
    borderRadius: ms(18), padding: wp(16),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  descriptionText: { fontSize: ms(14), lineHeight: ms(22), fontWeight: '400' as const },

  // Loyalty
  loyaltyRewardCard: {
    borderRadius: ms(18), padding: wp(16),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  loyaltyRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(12) },
  loyaltyDivider: { height: StyleSheet.hairlineWidth, marginVertical: hp(12) },
  cardIconBadge: { width: ms(36), height: ms(36), borderRadius: ms(12), alignItems: 'center' as const, justifyContent: 'center' as const },
  cardLabel: { fontSize: ms(11), fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: hp(4) },
  cardValue: { fontSize: ms(14), fontWeight: '700' as const, lineHeight: ms(20) },
  balanceBadge: { paddingHorizontal: wp(10), paddingVertical: hp(4), borderRadius: ms(10), alignSelf: 'flex-start' as const },
  balanceBadgeText: { fontSize: ms(13), fontWeight: '800' as const },
  rewardsSectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(12), marginBottom: hp(8) },
  rewardsScroll: { marginBottom: hp(4) },
  rewardsScrollContent: { gap: wp(10) },
  rewardCard: { alignItems: 'center' as const, width: wp(120), paddingVertical: hp(12), paddingHorizontal: wp(10), borderRadius: ms(14), borderWidth: 1 },
  rewardCardTitle: { fontSize: ms(12), fontWeight: '700' as const, lineHeight: ms(16), textAlign: 'center' as const, marginTop: hp(6), marginBottom: hp(6) },
  rewardCostBadge: { paddingHorizontal: wp(10), paddingVertical: hp(3), borderRadius: ms(8) },
  rewardCost: { fontSize: ms(11), fontWeight: '700' as const },

  // Social
  socialRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: wp(14), paddingBottom: hp(16) },
  socialIconBtn: { width: ms(42), height: ms(42), borderRadius: ms(21), alignItems: 'center' as const, justifyContent: 'center' as const },

  // Locations
  otherLocationsCard: {
    borderRadius: ms(18), padding: wp(14),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  otherLocationsHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(12), marginBottom: hp(6) },
  otherLocationsCount: { fontSize: ms(12), fontWeight: '500' as const, marginTop: hp(2) },
  storeItem: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(12),
    paddingVertical: hp(12), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#00000008',
    borderRadius: ms(8), paddingHorizontal: wp(4),
  },
  storeItemDot: { width: ms(8), height: ms(8), borderRadius: ms(4) },
  storeItemName: { fontSize: ms(14), fontWeight: '700' as const, lineHeight: ms(20) },
  storeAddress: { fontSize: ms(12), fontWeight: '400' as const, lineHeight: ms(17), marginTop: hp(2) },
  storePhoneRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(5), marginTop: hp(4) },
  storePhone: { fontSize: ms(12), fontWeight: '600' as const, lineHeight: ms(17) },
  storeDistance: { fontSize: ms(12), fontWeight: '600' as const, marginRight: wp(4) },

  // Bottom bar
  bottomBar: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: wp(16), paddingTop: hp(10) },
  bottomBarInner: {},
  joinBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: wp(10), paddingVertical: hp(15), borderRadius: ms(16),
    ...Platform.select({
      ios: { shadowColor: palette.violet, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  joinBtnText: { color: '#fff', fontSize: ms(15), fontWeight: '700' as const, letterSpacing: 0.2 },
  joinedBanner: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: wp(8), paddingVertical: hp(13), borderRadius: ms(14), borderWidth: 1,
  },
  joinedText: { fontSize: ms(14), fontWeight: '700' as const },
  memberBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(10) },
  leaveBtn: { width: ms(46), height: ms(46), borderRadius: ms(14), borderWidth: 1.5, alignItems: 'center' as const, justifyContent: 'center' as const },
});
