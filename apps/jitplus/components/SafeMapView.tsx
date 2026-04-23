/**
 * SafeMapView — Wrapper autour de react-native-maps.
 * - Dev build / standalone: Affiche Google Maps (Android) / Apple Maps (iOS)
 * - Expo Go SDK 51+: react-native-maps n'est plus inclus → graceful fallback
 */
import React, { forwardRef, useEffect, useState } from 'react';
import { Platform, View, Text, StyleSheet, NativeModules } from 'react-native';
import type MapViewType from 'react-native-maps';
import type { Marker as MarkerType, MapViewProps, MapMarkerProps } from 'react-native-maps';
import { wp, ms } from '@/utils/responsive';
import i18n from '@/i18n';

let RNMapView: typeof MapViewType | null = null;
let RNMarker: typeof MarkerType | null = null;
let RN_PROVIDER_GOOGLE: 'google' | null = null;
export let MAPS_AVAILABLE = false;

try {
  const Maps = require('react-native-maps') as typeof import('react-native-maps');
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

const SafeMapView = forwardRef<MapViewType, MapViewProps>((props, ref) => {
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [renderTimedOut, setRenderTimedOut] = useState(false);

  useEffect(() => {
    if (!MAPS_AVAILABLE || !RNMapView || mapLoaded) return;
    const t = setTimeout(() => setRenderTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [mapLoaded]);

  if (!MAPS_AVAILABLE || !RNMapView) {
    return (
      <View style={fallbackStyles.container}>
        <Text style={fallbackStyles.text}>🗺️ {i18n.t('discover.mapUnavailable', { defaultValue: 'Map unavailable in Expo Go' })}</Text>
        <Text style={fallbackStyles.hint}>{i18n.t('discover.mapUnavailableHint', { defaultValue: 'Use a dev build to see the map' })}</Text>
      </View>
    );
  }

  if (renderTimedOut) {
    return (
      <View style={fallbackStyles.container}>
        <Text style={fallbackStyles.text}>{i18n.t('discover.mapTemporarilyUnavailable', { defaultValue: 'Map temporarily unavailable' })}</Text>
        <Text style={fallbackStyles.hint}>{i18n.t('discover.mapCheckApiKey', { defaultValue: 'Check Google Maps key (package + SHA-1)' })}</Text>
      </View>
    );
  }

  const providerProp = Platform.OS === 'android' && RN_PROVIDER_GOOGLE
    ? { provider: RN_PROVIDER_GOOGLE }
    : {};
  const configuredRenderer = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_RENDERER ?? '').toUpperCase();
  const androidRendererProp: Record<string, unknown> =
    Platform.OS === 'android' && (configuredRenderer === 'LEGACY' || configuredRenderer === 'LATEST')
      ? { googleRenderer: configuredRenderer as "LEGACY" | "LATEST" }
      : {};
  return (
    <RNMapView
      ref={ref}
      {...(androidRendererProp as Record<string, unknown>)}
      {...providerProp}
      {...props}
      onMapReady={() => {
        setMapReady(true);
        if (__DEV__) {
          const locale = Platform.OS === 'ios'
            ? NativeModules.SettingsManager?.settings?.AppleLocale ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
            : NativeModules.I18nManager?.localeIdentifier;
          console.log(`[SafeMapView] ✓ Google Maps ready — device locale: ${locale}`);
          console.log(`[SafeMapView] ✓ Provider: ${Platform.OS === 'android' ? 'PROVIDER_GOOGLE' : 'Apple Maps'}`);
          if (Platform.OS === 'android' && configuredRenderer) {
            console.log(`[SafeMapView] ✓ Android renderer: ${configuredRenderer}`);
          }
          console.log('[SafeMapView] ✓ Region bias: MA (via withMoroccoRegion plugin)');
        }
        props.onMapReady?.();
      }}
      onMapLoaded={(event) => {
        setMapLoaded(true);
        setRenderTimedOut(false);
        // onMapLoaded is not typed in all react-native-maps versions.
        (props as MapViewProps & { onMapLoaded?: (e: unknown) => void }).onMapLoaded?.(event);
      }}
    />
  );
});

SafeMapView.displayName = 'SafeMapView';

export const Marker: React.ComponentType<MapMarkerProps> = RNMarker as unknown as React.ComponentType<MapMarkerProps> ?? (() => null);
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
