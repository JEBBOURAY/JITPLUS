/**
 * SafeMapView — Wrapper autour de react-native-maps qui ne crash pas dans Expo Go.
 * Si le module natif n'est pas disponible, affiche une carte statique OpenStreetMap
 * avec le marqueur, un bouton « Ouvrir dans Maps » et un indicateur de coordonnées.
 */
import React, { forwardRef, useImperativeHandle, useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Linking,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  NativeModules,
} from 'react-native';
import { MapPin, ExternalLink, Navigation } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

/* ---------- Chargement conditionnel de react-native-maps ---------- */
let RNMapView: React.ComponentType<any> | null = null;
let RNMarker: React.ComponentType<any> | null = null;
let RN_PROVIDER_GOOGLE: string | null = null;

try {
  const maps = require('react-native-maps');
  RNMapView = maps.default;
  RNMarker = maps.Marker;
  RN_PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch {
  // Module natif non disponible (Expo Go)
}

export const PROVIDER_GOOGLE = RN_PROVIDER_GOOGLE;

/* ---------- Helpers ---------- */
/** Extrait les coordonnées de TOUS les <Marker> enfants */
function extractAllMarkerCoords(children: React.ReactNode): { latitude: number; longitude: number }[] {
  const coords: { latitude: number; longitude: number }[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as Record<string, unknown> | undefined;
    const coordinate = props?.coordinate as { latitude?: number; longitude?: number } | undefined;
    if (coordinate && typeof coordinate.latitude === 'number' && typeof coordinate.longitude === 'number') {
      coords.push({ latitude: coordinate.latitude, longitude: coordinate.longitude });
    }
  });
  return coords;
}

/** Construit l'URL de la carte statique OpenStreetMap avec plusieurs marqueurs */
function buildStaticMapUrl(
  markers: { latitude: number; longitude: number }[],
  width = 600,
  height = 400,
): string {
  if (markers.length === 0) {
    return `https://staticmap.openstreetmap.de/staticmap.php?center=33.5731,-7.5898&zoom=6&size=${width}x${height}&maptype=mapnik`;
  }

  // Calculate bounding box
  const lats = markers.map((m) => m.latitude);
  const lngs = markers.map((m) => m.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Auto-zoom based on span
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const span = Math.max(latSpan, lngSpan);
  let zoom = 16;
  if (markers.length > 1) {
    if (span > 5) zoom = 6;
    else if (span > 2) zoom = 7;
    else if (span > 1) zoom = 8;
    else if (span > 0.5) zoom = 9;
    else if (span > 0.2) zoom = 10;
    else if (span > 0.1) zoom = 11;
    else if (span > 0.05) zoom = 12;
    else if (span > 0.02) zoom = 13;
    else if (span > 0.01) zoom = 14;
    else zoom = 15;
  }

  const markersStr = markers.map((m) => `${m.latitude},${m.longitude},red-pushpin`).join('|');
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik&markers=${markersStr}`;
}

/* ---------- Fallback : carte statique + actions ---------- */
interface FallbackProps {
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  markers: { latitude: number; longitude: number }[];
  centerLat: number;
  centerLng: number;
  hasCoords: boolean;
}

function MapFallback({ style, markers, centerLat, centerLng, hasCoords }: FallbackProps) {
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const { t } = useLanguage();

  const openInMaps = useCallback(() => {
    const url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${centerLat},${centerLng}`
        : `geo:${centerLat},${centerLng}?q=${centerLat},${centerLng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps?q=${centerLat},${centerLng}`),
    );
  }, [centerLat, centerLng]);

  if (!hasCoords) {
    return (
      <View style={[styles.fallback, style]}>
        <Navigation size={28} color="#94a3b8" />
        <Text style={styles.fallbackTitle}>{t('safeMap.positionUndefined')}</Text>
        <Text style={styles.fallbackText}>
          {t('safeMap.positionHint')}
        </Text>
      </View>
    );
  }

  const staticUrl = useMemo(() => buildStaticMapUrl(markers), [markers]);

  return (
    <View style={[styles.imgContainer, style]}>
      {/* Image de la carte statique */}
      <Image
        source={{ uri: staticUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoadStart={() => { setImgLoading(true); setImgError(false); }}
        onLoadEnd={() => setImgLoading(false)}
        onError={() => { setImgLoading(false); setImgError(true); }}
      />

      {imgLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#7C3AED" />
          <Text style={styles.loadingText}>{t('safeMap.loadingMap')}</Text>
        </View>
      )}

      {imgError && (
        <View style={styles.loadingOverlay}>
          <MapPin size={24} color="#94a3b8" />
          <Text style={styles.fallbackTitle}>{t('safeMap.imageUnavailable')}</Text>
        </View>
      )}

      {/* Badge nombre de marqueurs */}
      <View style={styles.coordsBadge}>
        <MapPin size={12} color="#fff" />
        <Text style={styles.coordsText}>
          {t('safeMap.markerCount', { count: markers.length })}
        </Text>
      </View>

      {/* Bouton « Ouvrir dans Maps » */}
      <TouchableOpacity style={styles.openBtn} onPress={openInMaps} activeOpacity={0.8}>
        <ExternalLink size={14} color="#fff" />
        <Text style={styles.openBtnText}>{t('safeMap.openInMaps')}</Text>
      </TouchableOpacity>
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
}

const SafeMapView = forwardRef<SafeMapViewRef, SafeMapViewProps>((props, ref) => {
  const { children, initialRegion, region, style, onPress, onLongPress, onMapReady: onMapReadyProp, onMapLoaded: onMapLoadedProp, ...rest } = props;
  const nativeMapRef = useRef<{ animateToRegion?: (...args: unknown[]) => void; animateCamera?: (...args: unknown[]) => void; fitToCoordinates?: (...args: unknown[]) => void } | null>(null);
  const [, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [renderTimedOut, setRenderTimedOut] = useState(false);
  const configuredRenderer = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_RENDERER ?? '').toUpperCase();
  const androidRendererProp =
    Platform.OS === 'android' && (configuredRenderer === 'LEGACY' || configuredRenderer === 'LATEST')
      ? { googleRenderer: configuredRenderer as 'LEGACY' | 'LATEST' }
      : {};

  useEffect(() => {
    if (!RNMapView || mapLoaded) return;
    const t = setTimeout(() => setRenderTimedOut(true), 9000);
    return () => clearTimeout(t);
  }, [mapLoaded]);

  /* Expose map methods: forward to native ref when available, no-op otherwise */
  useImperativeHandle(ref, () => ({
    animateToRegion: (...args: unknown[]) => nativeMapRef.current?.animateToRegion?.(...args),
    animateCamera: (...args: unknown[]) => nativeMapRef.current?.animateCamera?.(...args),
    fitToCoordinates: (...args: unknown[]) => nativeMapRef.current?.fitToCoordinates?.(...args),
  }), []);

  if (RNMapView && !renderTimedOut) {
    return (
      <RNMapView
        ref={nativeMapRef}
        style={style}
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
            console.log(`[SafeMapView] ✓ Google Maps ready — device locale: ${locale}`);
            console.log(`[SafeMapView] ✓ Provider: ${rest.provider ?? 'default'}`);
            if (Platform.OS === 'android' && configuredRenderer) {
              console.log(`[SafeMapView] ✓ Android renderer: ${configuredRenderer}`);
            }
            console.log('[SafeMapView] ✓ Region bias: MA (via withMoroccoRegion plugin)');
          }
          onMapReadyProp?.();
        }}
        onMapLoaded={() => {
          setMapLoaded(true);
          setRenderTimedOut(false);
          onMapLoadedProp?.();
        }}
      >
        {children}
      </RNMapView>
    );
  }

  /* ----- Mode fallback (Expo Go) ----- */
  const allMarkerCoords = useMemo(() => extractAllMarkerCoords(children), [children]);
  const regionCoords = region || initialRegion;
  const hasCoords = allMarkerCoords.length > 0 || !!regionCoords;

  // Use markers if available, otherwise center on region
  const markers = useMemo(() => {
    return allMarkerCoords.length > 0
      ? allMarkerCoords
      : regionCoords
        ? [{ latitude: regionCoords.latitude, longitude: regionCoords.longitude }]
        : [];
  }, [allMarkerCoords, regionCoords]);

  const { centerLat, centerLng } = useMemo(() => {
    if (markers.length === 0) return { centerLat: 33.5731, centerLng: -7.5898 };
    const latSum = markers.reduce((sum: number, m: { latitude: number; longitude: number }) => sum + m.latitude, 0);
    const lngSum = markers.reduce((sum: number, m: { latitude: number; longitude: number }) => sum + m.longitude, 0);
    return {
      centerLat: latSum / markers.length,
      centerLng: lngSum / markers.length,
    };
  }, [markers]);

  return <MapFallback style={style} markers={markers} centerLat={centerLat} centerLng={centerLng} hasCoords={hasCoords} />;
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
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    padding: 24,
    minHeight: 180,
  },
  fallbackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 8,
  },
  fallbackText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  imgContainer: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    minHeight: 180,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241,245,249,0.85)',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
  },
  coordsBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  coordsText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
  },
  openBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124,58,237,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  openBtnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
});
