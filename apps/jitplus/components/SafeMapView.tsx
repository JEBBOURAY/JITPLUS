/**
 * SafeMapView — Wrapper autour de react-native-maps.
 * - Dev build / standalone: Affiche Google Maps (Android) / Apple Maps (iOS)
 * - Expo Go SDK 51+: react-native-maps n'est plus inclus → graceful fallback
 */
import React, { forwardRef } from 'react';
import { Platform, View, Text, StyleSheet, NativeModules } from 'react-native';
import { wp, ms } from '@/utils/responsive';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RNMapView: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RNMarker: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RN_PROVIDER_GOOGLE: any = null;
export let MAPS_AVAILABLE = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Maps = require('react-native-maps');
  RNMapView = Maps.default;
  RNMarker = Maps.Marker;
  RN_PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  // Only mark as available if the actual components exist —
  // Expo Go SDK 53+ may partially resolve the module without throwing.
  MAPS_AVAILABLE = !!RNMapView && !!RNMarker;
} catch {
  // react-native-maps unavailable (Expo Go SDK 51+)
  MAPS_AVAILABLE = false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SafeMapView = forwardRef<any, any>((props, ref) => {
  if (!MAPS_AVAILABLE || !RNMapView) {
    return (
      <View style={fallbackStyles.container}>
        <Text style={fallbackStyles.text}>🗺️ Carte indisponible dans Expo Go</Text>
        <Text style={fallbackStyles.hint}>Utilisez un dev build pour voir la carte</Text>
      </View>
    );
  }

  const providerProp = Platform.OS === 'android' ? { provider: RN_PROVIDER_GOOGLE } : {};
  return (
    <RNMapView
      ref={ref}
      {...providerProp}
      {...props}
      onMapReady={() => {
        if (__DEV__) {
          const locale = Platform.OS === 'ios'
            ? NativeModules.SettingsManager?.settings?.AppleLocale ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
            : NativeModules.I18nManager?.localeIdentifier;
          console.log(`[SafeMapView] ✓ Google Maps ready — device locale: ${locale}`);
          console.log(`[SafeMapView] ✓ Provider: ${Platform.OS === 'android' ? 'PROVIDER_GOOGLE' : 'Apple Maps'}`);
          console.log('[SafeMapView] ✓ Region bias: MA (via withMoroccoRegion plugin)');
        }
        props.onMapReady?.();
      }}
    />
  );
});

SafeMapView.displayName = 'SafeMapView';

export const Marker = RNMarker ?? (() => null);
export default SafeMapView;

const fallbackStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: ms(16),
    padding: wp(24),
  },
  text: { fontSize: ms(16), fontWeight: '600', color: '#333', marginBottom: 4 },
  hint: { fontSize: ms(13), color: '#888' },
});
