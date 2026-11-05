/**
 * SafeMapView — Wrapper autour de react-native-maps.
 * - Dev build / standalone: Affiche Google Maps (Android) / Apple Maps (iOS)
 * - Expo Go SDK 51+: react-native-maps n'est plus inclus → graceful fallback
 */
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View, StyleSheet, NativeModules, Pressable } from 'react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { Text } from '@/components/AppText';
import { requireOptionalNativeModule } from 'expo';
import type MapViewType from 'react-native-maps';
import type { Marker as MarkerType, MapViewProps, MapMarkerProps, Region } from 'react-native-maps';
import { wp, ms } from '@/utils/responsive';
import i18n from '@/i18n';

let RNMapView: typeof MapViewType | null = null;
let RNMarker: typeof MarkerType | null = null;
let RN_PROVIDER_GOOGLE: 'google' | null = null;
export let MAPS_AVAILABLE = false;

/**
 * Google Maps on Android throws a native "API key not found" exception
 * (uncatchable from JS, kills the app) when the manifest has no key. The
 * react-native-maps config plugin deletes that key when it is listed without
 * `androidGoogleMapsApiKey`. Read the app config embedded in the binary at
 * build time: `Constants.expoConfig` comes from the OTA manifest instead, and
 * strips `android.config`, so it cannot tell which binary is installed.
 */
function isAndroidMapsKeyMissing(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    const raw = requireOptionalNativeModule<{ manifest?: string | Record<string, unknown> }>('ExponentConstants')?.manifest;
    if (!raw) return false;
    const embedded = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { plugins?: unknown[] };
    const entry = embedded.plugins?.find((p) => (Array.isArray(p) ? p[0] : p) === 'react-native-maps');
    if (!entry) return false;
    const options = Array.isArray(entry) ? (entry[1] as { androidGoogleMapsApiKey?: string } | undefined) : undefined;
    return !options?.androidGoogleMapsApiKey;
  } catch {
    return false;
  }
}

try {
  const Maps = require('react-native-maps') as typeof import('react-native-maps');
  RNMapView = Maps.default;
  RNMarker = Maps.Marker;
  RN_PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  // Only mark as available if the actual components exist —
  // Expo Go SDK 53+ may partially resolve the module without throwing.
  MAPS_AVAILABLE = !!RNMapView && !!RNMarker && !isAndroidMapsKeyMissing();
} catch {
  // react-native-maps unavailable (Expo Go SDK 51+)
  MAPS_AVAILABLE = false;
}

/**
 * Delay before telling the user the map is slow. The map stays mounted: on a
 * slow network the tiles still arrive afterwards, and the hint goes away.
 */
const SLOW_LOAD_MS = 8000;

const SafeMapView = forwardRef<MapViewType, MapViewProps>((props, ref) => {
  const theme = useTheme();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  // Bumped by "Retry" to remount the native map (a fresh tile/key handshake).
  const [mapKey, setMapKey] = useState(0);
  // Last camera, so a remount reopens where the user was instead of initialRegion.
  const lastRegionRef = useRef<Region | null>(null);

  useEffect(() => {
    if (!MAPS_AVAILABLE || !RNMapView || mapLoaded) return;
    const t = setTimeout(() => setSlowLoad(true), SLOW_LOAD_MS);
    return () => clearTimeout(t);
  }, [mapLoaded, mapKey]);

  const retry = useCallback(() => {
    setSlowLoad(false);
    setMapLoaded(false);
    setMapKey((k) => k + 1);
  }, []);

  // Callers check MAPS_AVAILABLE and render their own fallback.
  if (!MAPS_AVAILABLE || !RNMapView) return null;

  // Force Google Maps on BOTH platforms so customMapStyle, tile rendering,
  // POI styling and colors are identical on Android and iOS.
  // Requires ios.config.googleMapsApiKey in app.config.js (already configured).
  const providerProp = RN_PROVIDER_GOOGLE
    ? { provider: RN_PROVIDER_GOOGLE }
    : {};
  const configuredRenderer = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_RENDERER ?? '').toUpperCase();
  const androidRendererProp: Record<string, unknown> =
    Platform.OS === 'android' && (configuredRenderer === 'LEGACY' || configuredRenderer === 'LATEST')
      ? { googleRenderer: configuredRenderer as "LEGACY" | "LATEST" }
      : {};
  const { style, ...mapProps } = props;
  return (
    <View style={style}>
    <RNMapView
      key={mapKey}
      ref={ref}
      style={StyleSheet.absoluteFill}
      {...(androidRendererProp as Record<string, unknown>)}
      {...providerProp}
      {...mapProps}
      initialRegion={(mapKey > 0 && lastRegionRef.current) || props.initialRegion}
      onRegionChangeComplete={(region, details) => {
        lastRegionRef.current = region;
        props.onRegionChangeComplete?.(region, details);
      }}
      onMapReady={() => {
        if (__DEV__) {
          const locale = Platform.OS === 'ios'
            ? NativeModules.SettingsManager?.settings?.AppleLocale ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
            : NativeModules.I18nManager?.localeIdentifier;
          console.log(`[SafeMapView] ✓ Google Maps ready — device locale: ${locale}`);
          console.log(`[SafeMapView] ✓ Provider: PROVIDER_GOOGLE (${Platform.OS})`);
          if (Platform.OS === 'android' && configuredRenderer) {
            console.log(`[SafeMapView] ✓ Android renderer: ${configuredRenderer}`);
          }
          console.log('[SafeMapView] ✓ Region bias: MA (via withMoroccoRegion plugin)');
        }
        props.onMapReady?.();
      }}
      onMapLoaded={(event) => {
        setMapLoaded(true);
        setSlowLoad(false);
        // onMapLoaded is not typed in all react-native-maps versions.
        (props as MapViewProps & { onMapLoaded?: (e: unknown) => void }).onMapLoaded?.(event);
      }}
    />
    {slowLoad && (
      <View style={slowStyles.slowWrap} pointerEvents="box-none">
        <Pressable
          onPress={retry}
          style={({ pressed }) => [slowStyles.slowCard, { backgroundColor: theme.bgCard }, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('common.retry')}
        >
          <Text style={[slowStyles.slowTitle, { color: theme.text }]}>{i18n.t('discover.mapSlowTitle')}</Text>
          <Text style={[slowStyles.slowHint, { color: theme.textMuted }]}>
            {__DEV__ ? 'Dev: check the Google Maps key (package + SHA-1)' : i18n.t('discover.mapSlowHint')}
          </Text>
          <Text style={slowStyles.slowRetry}>{i18n.t('common.retry')}</Text>
        </Pressable>
      </View>
    )}
    </View>
  );
});

SafeMapView.displayName = 'SafeMapView';

export const Marker: React.ComponentType<MapMarkerProps> = RNMarker as unknown as React.ComponentType<MapMarkerProps> ?? (() => null);
export default SafeMapView;

const slowStyles = StyleSheet.create({
  slowWrap: { position: 'absolute', left: 0, right: 0, bottom: ms(170), alignItems: 'center', paddingHorizontal: wp(16) },
  slowCard: {
    borderRadius: ms(16), paddingVertical: ms(12), paddingHorizontal: ms(18), alignItems: 'center', maxWidth: 360,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12 }, android: { elevation: 6 } }),
  },
  slowTitle: { fontSize: ms(14), fontWeight: '600', textAlign: 'center' },
  slowHint: { fontSize: ms(12), marginTop: 2, textAlign: 'center' },
  slowRetry: { fontSize: ms(13), fontWeight: '700', color: palette.violet, marginTop: ms(6) },
});
