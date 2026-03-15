/**
 * SafeMapView — Web fallback (no react-native-maps on web).
 * Exports the same API as the native version.
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const PROVIDER_GOOGLE = null;

export interface SafeMapViewRef {
  animateToRegion: (...args: unknown[]) => void;
  animateCamera: (...args: unknown[]) => void;
  fitToCoordinates: (...args: unknown[]) => void;
}

const SafeMapView = forwardRef<SafeMapViewRef, any>((props, ref) => {
  useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
    animateCamera: () => {},
    fitToCoordinates: () => {},
  }), []);

  return (
    <View style={[styles.container, props.style]}>
      <Text style={styles.text}>🗺️ Carte indisponible sur le web</Text>
    </View>
  );
});

SafeMapView.displayName = 'SafeMapView';

export function Marker(_props: Record<string, unknown>) {
  return null;
}

export default SafeMapView;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 24,
    minHeight: 180,
  },
  text: { fontSize: 16, fontWeight: '600', color: '#64748b' },
});
