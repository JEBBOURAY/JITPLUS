/**
 * MapMarker — simple square marker with JitPlus logo.
 */
import { memo } from 'react';
import { View, StyleSheet, Image } from 'react-native';

const SIZE = 30;
const LOGO_SIZE = 20;
const LOGO = require('@/assets/images/jitpluslogo_marker.png');

const MapMarker = memo(function MapMarker() {
  return (
    <View collapsable={false} style={styles.root} accessibilityLabel="JitPlus" accessibilityRole="image">
      {/* On utilise l'Image native de React Native car expo-image bogue souvent (marqueurs blancs) sur Google Maps iOS */}
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
