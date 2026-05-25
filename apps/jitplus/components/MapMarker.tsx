/**
 * MapMarker — simple square marker with JitPlus logo.
 */
import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

const SIZE = 30;
const LOGO_SIZE = 20;
const LOGO = require('@/assets/images/jitpluslogo.png');

const MapMarker = memo(function MapMarker() {
  return (
    <View collapsable={false} style={styles.root} accessibilityLabel="JitPlus" accessibilityRole="image">
      <Image source={LOGO} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
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
