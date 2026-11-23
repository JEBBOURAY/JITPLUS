import { StyleSheet, View } from 'react-native';
import FadeInView from '@/components/FadeInView';
import Skeleton from '@/components/Skeleton';
import { getWalletCardSize } from '@/components/home/CardCarousel';
import { hp, radius, wp, SCREEN } from '@/utils/responsive';

/** Home placeholder shaped like the card carousel (a card and both neighbours) and its shortcuts. */
export default function WalletSkeleton() {
  const size = getWalletCardSize(SCREEN.width);
  const side = { width: size.width * 0.8, height: size.height * 0.8 };
  const sideOffset = SCREEN.width / 2 - size.step - side.width / 2;
  return (
    <FadeInView delay={150} style={styles.wrap}>
      <View style={[styles.row, { height: size.height }]}>
        <Skeleton width={side.width} height={side.height} borderRadius={radius['2xl']} style={{ position: 'absolute', left: sideOffset, opacity: 0.6 }} />
        <Skeleton width={side.width} height={side.height} borderRadius={radius['2xl']} style={{ position: 'absolute', right: sideOffset, opacity: 0.6 }} />
        <Skeleton width={size.width} height={size.height} borderRadius={radius['2xl']} />
      </View>
      <Skeleton width="100%" height={hp(120)} borderRadius={radius.xl} style={styles.below} />
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  // Same top inset as the carousel, so nothing jumps when the cards arrive.
  wrap: { paddingTop: hp(8) },
  row: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginHorizontal: -wp(16) },
  below: { marginTop: hp(30) },
});
