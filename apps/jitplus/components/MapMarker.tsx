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
const LOGO = require('@/assets/images/jitpluslogo.png');

const MapMarker = memo(function MapMarker() {
  return (
    <View collapsable={false} style={styles.root} accessibilityLabel="JitPlus" accessibilityRole="image">
      <Image source={LOGO} style={styles.logo} resizeMode="contain" fadeDuration={0} />
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
});
