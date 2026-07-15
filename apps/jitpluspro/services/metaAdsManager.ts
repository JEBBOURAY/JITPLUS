import { AppState, NativeModules, Platform } from 'react-native';

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
    if (AppState.currentState !== 'active') return;

    try {
      const trackingStatus = await MetaAdsManager.requestTrackingPermission();
      const isTrackingGranted = trackingStatus === 'granted' || trackingStatus === 'authorized';

      const { Settings, AppEventsLogger } = await import('react-native-fbsdk-next');

      Settings.initializeSDK();
      Settings.setAdvertiserTrackingEnabled?.(isTrackingGranted);
      Settings.setAdvertiserIDCollectionEnabled?.(isTrackingGranted);

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
      if (!NativeModules?.ExpoTrackingTransparency) return 'unavailable';

      const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      const result = await requestTrackingPermissionsAsync();
      return result.status as TrackingStatus;
    } catch {
      return 'unavailable';
    }
  }
}

export default MetaAdsManager;