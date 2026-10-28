import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import { haptic, hapticSuccess, HapticStyle } from '@/utils/haptics';
// react-native-view-shot is NOT available in Expo Go SDK 51+
import type ViewShotType from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';

type Translate = (key: string) => string;

export let ViewShot: typeof ViewShotType | null = null;
try {
  ViewShot = require('react-native-view-shot').default as typeof ViewShotType;
} catch {
  // Not available in Expo Go — share QR will be disabled
}

// expo-media-library is a NATIVE module. It must be loaded lazily: an eager
// top-level `import` runs requireNativeModule() at module-eval time, which THROWS
// on binaries that don't contain the native code (e.g. an OTA/EAS update shipped
// to an older build). That throw makes the whole route module fail to load, so
// expo-router receives `undefined` from loadRoute() and crashes in fromImport
// with "Cannot read property 'ErrorBoundary' of undefined". Loading it in a
// try/catch keeps the QR screen working; save-to-gallery just degrades gracefully.
let MediaLibrary: typeof import('expo-media-library') | null = null;
try {
  MediaLibrary = require('expo-media-library');
} catch {
  // Native module not present in this binary — save-to-gallery will be disabled
}

/** Share / save-to-gallery of the loyalty card captured as a PNG. */
export function useQrCardExport(t: Translate) {
  const viewShotRef = useRef<ViewShotRef | null>(null);

  /** Silent when capture is impossible: each caller shows its own message. */
  const captureCard = useCallback(async (): Promise<string | null> => {
    if (!ViewShot) return null;
    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) { Alert.alert(t('common.error'), t('qr.captureError')); return null; }
      return uri;
    } catch (error) {
      if (__DEV__) console.error('Capture error:', error);
      Alert.alert(t('common.error'), t('qr.captureError'));
      return null;
    }
  }, [t]);

  const share = useCallback(async () => {
    haptic(HapticStyle.Medium);
    if (!ViewShot) {
      Alert.alert(t('qr.sharingUnavailable'), t('qr.sharingUnavailableMsg'));
      return;
    }
    const uri = await captureCard();
    if (!uri) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) { Alert.alert(t('qr.sharingUnavailable'), t('qr.sharingUnavailableMsg')); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('qr.shareDialogTitle'), UTI: 'public.png' });
    } catch (error) {
      if (__DEV__) console.error('Share error:', error);
      Alert.alert(t('common.error'), t('qr.shareError'));
    }
  }, [captureCard, t]);

  /** Uses add-only (writeOnly) permission — the app never reads the library. */
  const saveToGallery = useCallback(async () => {
    haptic(HapticStyle.Medium);
    if (!MediaLibrary || !ViewShot) {
      Alert.alert(t('qr.saveUnavailable'), t('qr.saveUnavailableMsg'));
      return;
    }
    const uri = await captureCard();
    if (!uri) return;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert(t('qr.permissionDeniedTitle'), t('qr.permissionDeniedMsg'));
        return;
      }
      // Since expo-media-library 57, the legacy saveToLibraryAsync() exported
      // from the package root always throws; Asset.create() is its replacement.
      // ViewShot returns a bare path on iOS; Photos needs a file:// URL.
      await MediaLibrary.Asset.create(uri.startsWith('/') ? `file://${uri}` : uri);
      hapticSuccess();
      Alert.alert(t('qr.savedTitle'), t('qr.savedMsg'));
    } catch (error) {
      if (__DEV__) console.error('Save to gallery error:', error);
      Alert.alert(t('common.error'), t('qr.saveError'));
    }
  }, [captureCard, t]);

  return { viewShotRef, share, saveToGallery };
}
