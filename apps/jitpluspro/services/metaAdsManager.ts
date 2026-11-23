import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type TrackingStatus = 'unavailable' | 'denied' | 'authorized' | 'restricted' | 'not-determined' | 'granted';

class MetaAdsManager {
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (MetaAdsManager.initialized) return;
    if (Platform.OS !== 'ios') return;

    MetaAdsManager.initialized = true;

    // Avoid adding extra work on the iOS launch critical path.
    setTimeout(() => {
      void MetaAdsManager.initializeInternal();
    }, 1500);
  }

  private static async initializeInternal(): Promise<void> {
    // The ATT prompt is only shown to an active app: wait for it instead of
    // giving up for the whole session (initialized is already true).
    if (AppState.currentState !== 'active') {
      const sub = AppState.addEventListener('change', (state) => {
        if (state !== 'active') return;
        sub.remove();
        void MetaAdsManager.initializeInternal();
      });
      return;
    }

    try {
      // IMPORTANT: Android relies on native manifest/plugin initialization.
      // Importing the JS SDK too early on Android can touch FBAccessToken before
      // native init and crash. Keep JS-side activation iOS-only.
      const { Settings, AppEventsLogger } = await import('react-native-fbsdk-next');

      // ATT first: on iOS the SDK no longer starts by itself
      // (plugins/withFacebookIOSConsent.js), so nothing reaches Meta before
      // the merchant has answered the prompt.
      const trackingStatus = await MetaAdsManager.requestTrackingPermission();
      const isTrackingGranted = trackingStatus === 'granted' || trackingStatus === 'authorized';
      Settings.setAdvertiserTrackingEnabled?.(isTrackingGranted);
      Settings.setAdvertiserIDCollectionEnabled?.(isTrackingGranted);
      Settings.initializeSDK();
      Settings.setAutoLogAppEventsEnabled?.(true);

      // Triggers the standard app activation event expected by Meta campaigns.
      // `activateApp` exists at runtime on older SDK bridges but is missing from
      // the current type definitions — narrow via an optional-method cast.
      const logger = AppEventsLogger as typeof AppEventsLogger & { activateApp?: () => void };
      if (typeof logger.activateApp === 'function') {
        logger.activateApp();
      } else {
        AppEventsLogger.logEvent('fb_mobile_activate_app');
      }
    } catch {
      // Never block app startup if Meta/ATT modules are unavailable.
    }
  }

  private static async requestTrackingPermission(): Promise<TrackingStatus> {
    try {
      // OTA updates can run on older binaries that don't embed this native module yet.
      // Expo modules are not in NativeModules (bridgeless): probing it there always
      // failed, so the ATT prompt was never shown.
      if (requireOptionalNativeModule('ExpoTrackingTransparency') == null) return 'unavailable';

      const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      const result = await requestTrackingPermissionsAsync();
      return result.status as TrackingStatus;
    } catch {
      return 'unavailable';
    }
  }
}

export default MetaAdsManager;