import { StyleSheet } from 'react-native';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';

export const scratchSharedStyles = StyleSheet.create({
  hint: { color: 'rgba(255,255,255,0.65)', fontSize: FS.sm, textAlign: 'center', paddingHorizontal: wp(16) },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(24), paddingBottom: hp(60), gap: hp(14) },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    paddingHorizontal: ms(18),
    height: ms(42),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ghostBtnText: { color: '#fff', fontSize: FS.sm },
});
