import { StyleSheet } from 'react-native';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';

/** Layout shared by the bottom sheets that announce something won. */
export const rewardSheetStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(22),

    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  handle: { marginBottom: hp(18) },
  content: { alignItems: 'center' },
  badge: { width: ms(84), height: ms(84), borderRadius: ms(42), alignItems: 'center', justifyContent: 'center', marginBottom: hp(14) },
  kicker: { fontSize: FS.sm, textAlign: 'center' },
  title: { fontSize: FS['2xl'], textAlign: 'center', letterSpacing: -0.4 },
  desc: { fontSize: FS.md, textAlign: 'center', marginTop: hp(6), lineHeight: ms(21), paddingHorizontal: wp(8) },
  primaryWrap: { alignSelf: 'stretch', marginTop: hp(20), borderRadius: radius.lg, overflow: 'hidden' },
  primary: { height: ms(52), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  primaryText: { color: '#fff', fontSize: FS.md },
});
