/**
 * SafeMapView — Wrapper autour de react-native-maps qui ne crash pas dans Expo Go.
 * - Dev build / standalone: Affiche Google Maps (Android) / Apple Maps (iOS)
 * - Expo Go: react-native-maps n'est pas disponible → graceful text fallback
 *   avec bouton « Ouvrir dans Maps » pour chaque boutique.
 */
import React, { forwardRef, useImperativeHandle, useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  TouchableOpacity,
  Platform,
  NativeModules,
} from 'react-native';
import { MapPin, ExternalLink, Navigation } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { palette } from '@/contexts/ThemeContext';
import { logInfo, logWarn } from '@/utils/devLogger';

/* ---------- Chargement conditionnel de react-native-maps ---------- */
let RNMapView: React.ComponentType<any> | null = null;
let RNMarker: React.ComponentType<any> | null = null;
let RN_PROVIDER_GOOGLE: string | null = null;

try {
  const maps = require('react-native-maps');
  RNMapView = maps.default;
  RNMarker = maps.Marker;
  RN_PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch (e) {
  if (__DEV__) logWarn('SafeMapView', 'react-native-maps not available (Expo Go?):', e);
}

export const PROVIDER_GOOGLE = RN_PROVIDER_GOOGLE;
export const MAPS_AVAILABLE = !!RNMapView && !!RNMarker;

/* ---------- Helpers ---------- */
/** Extrait les coordonnées de TOUS les <Marker> enfants */
function extractAllMarkerCoords(children: React.ReactNode): { latitude: number; longitude: number; title?: string }[] {
  const coords: { latitude: number; longitude: number; title?: string }[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as Record<string, unknown> | undefined;
    const coordinate = props?.coordinate as { latitude?: number; longitude?: number } | undefined;
    if (coordinate && typeof coordinate.latitude === 'number' && typeof coordinate.longitude === 'number') {
      coords.push({ latitude: coordinate.latitude, longitude: coordinate.longitude, title: props?.title as string | undefined });
    }
  });
  return coords;
}

/* ---------- Fallback : texte + bouton « Ouvrir dans Maps » ---------- */
interface FallbackProps {
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  markers: { latitude: number; longitude: number; title?: string }[];
  hasCoords: boolean;
}

function MapFallback({ style, markers, hasCoords }: FallbackProps) {
  const { t } = useLanguage();

  const openInMaps = useCallback((lat: number, lng: number) => {
    const url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`).catch(() => {}),
    );
  }, []);

  if (!hasCoords) {
    return (
      <View style={[styles.fallback, style]}>
        <Navigation size={28} color={palette.gray400} />
        <Text style={styles.fallbackTitle}>{t('safeMap.positionUndefined')}</Text>
        <Text style={styles.fallbackText}>
          {t('safeMap.positionHint')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fallback, style]}>
      <MapPin size={32} color={palette.violet} />
      <Text style={styles.fallbackTitle}>{t('safeMap.expoGoNotice')}</Text>
      <Text style={styles.fallbackText}>
        {t('safeMap.expoGoHint')}
      </Text>
      {markers.length > 0 && (
        <View style={styles.markerList}>
          {markers.map((m, i) => (
            <TouchableOpacity
              key={`${m.latitude}-${m.longitude}-${i}`}
              style={styles.markerBtn}
              onPress={() => openInMaps(m.latitude, m.longitude)}
              activeOpacity={0.7}
            >
              <ExternalLink size={14} color="#fff" />
              <Text style={styles.markerBtnText}>
                {m.title || `${m.latitude.toFixed(4)}, ${m.longitude.toFixed(4)}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

/* ---------- SafeMapView principal ---------- */
export interface SafeMapViewRef {
  animateToRegion: (...args: unknown[]) => void;
  animateCamera: (...args: unknown[]) => void;
  fitToCoordinates: (...args: unknown[]) => void;
}

interface SafeMapViewProps {
  children?: React.ReactNode;
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  region?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  onPress?: (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => void;
  onLongPress?: (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => void;
  onMapReady?: () => void;
  onMapLoaded?: () => void;
  provider?: string | null;
  showsUserLocation?: boolean;
  zoomEnabled?: boolean;
  scrollEnabled?: boolean;
  pitchEnabled?: boolean;
  rotateEnabled?: boolean;
  mapType?: string;
  customMapStyle?: readonly unknown[];
  showsPointsOfInterest?: boolean;
  showsBuildings?: boolean;
  showsIndoors?: boolean;
  showsTraffic?: boolean;
}

const SafeMapView = forwardRef<SafeMapViewRef, SafeMapViewProps>((props, ref) => {
  const { children, initialRegion, region, style, onPress, onLongPress, onMapReady: onMapReadyProp, onMapLoaded: onMapLoadedProp, ...rest } = props;
  const nativeMapRef = useRef<{ animateToRegion?: (...args: unknown[]) => void; animateCamera?: (...args: unknown[]) => void; fitToCoordinates?: (...args: unknown[]) => void } | null>(null);
  const [, setMapReady] = useState(false);
  const configuredRenderer = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_RENDERER ?? '').toUpperCase();
  const androidRendererProp =
    Platform.OS === 'android' && (configuredRenderer === 'LEGACY' || configuredRenderer === 'LATEST')
      ? { googleRenderer: configuredRenderer as 'LEGACY' | 'LATEST' }
      : {};

  /* Expose map methods: forward to native ref when available, no-op otherwise */
  useImperativeHandle(ref, () => ({
    animateToRegion: (...args: unknown[]) => nativeMapRef.current?.animateToRegion?.(...args),
    animateCamera: (...args: unknown[]) => nativeMapRef.current?.animateCamera?.(...args),
    fitToCoordinates: (...args: unknown[]) => nativeMapRef.current?.fitToCoordinates?.(...args),
  }), []);

  /* Hooks must be called unconditionally — compute fallback data before early return */
  const allMarkerCoords = useMemo(() => extractAllMarkerCoords(children), [children]);
  const regionCoords = region || initialRegion;
  const hasCoords = allMarkerCoords.length > 0 || !!regionCoords;
  const markers = useMemo(() => {
    return allMarkerCoords.length > 0
      ? allMarkerCoords
      : regionCoords
        ? [{ latitude: regionCoords.latitude, longitude: regionCoords.longitude }]
        : [];
  }, [allMarkerCoords, regionCoords]);

  // Always use Google Maps provider on Android — Apple Maps is iOS-only.
  // Previous code conditionally set provider based on Constants.expoConfig path
  // which is often empty at runtime in production builds, causing maps to fail.
  const providerProp = Platform.OS === 'android' ? { provider: RN_PROVIDER_GOOGLE } : {};

  if (RNMapView) {
    return (
      <RNMapView
        ref={nativeMapRef}
        style={style}
        {...providerProp}
        {...androidRendererProp}
        initialRegion={initialRegion}
        region={region}
        onPress={onPress}
        onLongPress={onLongPress}
        {...rest}
        onMapReady={() => {
          setMapReady(true);
          if (__DEV__) {
            const locale = Platform.OS === 'ios'
              ? NativeModules.SettingsManager?.settings?.AppleLocale ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
              : NativeModules.I18nManager?.localeIdentifier;
            logInfo('SafeMapView', `✓ Google Maps ready — device locale: ${locale}`);
            logInfo('SafeMapView', `✓ Provider: ${rest.provider ?? 'default'}`);
            if (Platform.OS === 'android' && configuredRenderer) {
              logInfo('SafeMapView', `✓ Android renderer: ${configuredRenderer}`);
            }
            logInfo('SafeMapView', '✓ Region bias: MA (via withMoroccoRegion plugin)');
          }
          onMapReadyProp?.();
        }}
        onMapLoaded={() => {
          onMapLoadedProp?.();
        }}
      >
        {children}
      </RNMapView>
    );
  }

  /* ----- Mode fallback (Expo Go) ----- */
  return <MapFallback style={style} markers={markers} hasCoords={hasCoords} />;
});

SafeMapView.displayName = 'SafeMapView';

/* ---------- Marker fallback ---------- */
/** En mode Expo Go, Marker est un no-op View qui ne rend rien de visible */
function MarkerFallback(_props: Record<string, unknown>) {
  // On ne rend rien : le fallback affiche déjà le marqueur sur l'image statique
  return null;
}

export const Marker = RNMarker || MarkerFallback;
export default SafeMapView;

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.gray100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.gray200,
    borderStyle: 'dashed',
    padding: 24,
    minHeight: 180,
  },
  fallbackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.gray500,
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Lexend_600SemiBold',
  },
  fallbackText: {
    fontSize: 12,
    color: palette.gray400,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    fontFamily: 'Lexend_400Regular',
  },
  markerList: {
    marginTop: 12,
    gap: 8,
    width: '100%',
    alignItems: 'center',
  },
  markerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(124,58,237,0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  markerBtnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
});
