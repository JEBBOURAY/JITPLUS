/**
 * MapMarker — simple square marker with JitPlus logo.
 */
import { memo } from 'react';
import { View, Image, StyleSheet } from 'react-native';

const SIZE = 30;
const LOGO_SIZE = 20;
const LOGO = require('@/assets/images/jitpluslogo.png');

interface Props {
  userPoints?: number;
  categorie?: string | null;
}

const MapMarker = memo(function MapMarker(_props: Props) {
  return (
    <View collapsable={false} style={styles.root}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
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
