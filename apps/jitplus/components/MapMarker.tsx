/**
 * MapMarker — simple square marker with JitPlus logo.
 *
 * NOTE: we deliberately use the built-in RN <Image> (not expo-image) because
 * react-native-maps on iOS (Google provider) snapshots the marker view into a
 * bitmap. expo-image loads asynchronously → the first snapshot can be empty,
 * which makes the marker invisible / un-tappable on iOS. RN's Image with a
 * bundled require() resolves synchronously and is rendered on first paint.
 */
import { memo } from 'react';
import { View, Image, StyleSheet } from 'react-native';

const SIZE = 30;
const LOGO_SIZE = 20;
const DOT_SIZE = 12;
const DOT_OVERFLOW = 4;
const LOGO = require('@/assets/images/jitpluslogo-app.png');

const MapMarker = memo(function MapMarker({ hasDeal = false }: { hasDeal?: boolean }) {
  const marker = (
    <View collapsable={false} style={styles.root} accessibilityLabel="JitPlus" accessibilityRole="image">
      <Image source={LOGO} style={styles.logo} resizeMode="contain" fadeDuration={0} />
    </View>
  );
  if (!hasDeal) return marker;
  // The dot stays inside the wrapper bounds: Android clips marker children
  // that overflow the root view.
  return (
    <View collapsable={false} style={styles.dealWrap}>
      {marker}
      <View style={styles.dealDot} />
    </View>
  );
});

export default MapMarker;

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  dealWrap: {
    width: SIZE + DOT_OVERFLOW * 2,
    height: SIZE + DOT_OVERFLOW * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
