import { Platform } from 'react-native';

type TrackingStatus = 'unavailable' | 'denied' | 'authorized' | 'restricted' | 'not-determined' | 'granted';

class MetaAdsManager {
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (MetaAdsManager.initialized) return;
    MetaAdsManager.initialized = true;

    if (Platform.OS !== 'ios') return;

    try {
      const trackingStatus = await MetaAdsManager.requestTrackingPermission();
      const isTrackingGranted = trackingStatus === 'granted' || trackingStatus === 'authorized';

      const { Settings, AppEventsLogger } = await import('react-native-fbsdk-next');

      Settings.initializeSDK();
      Settings.setAdvertiserTrackingEnabled?.(isTrackingGranted);
      Settings.setAdvertiserIDCollectionEnabled?.(isTrackingGranted);

      // Triggers the standard app activation event expected by Meta campaigns.
      AppEventsLogger.logEvent('fb_mobile_activate_app');
    } catch {
      // Never block app startup if Meta/ATT modules are unavailable.
    }
  }

  private static async requestTrackingPermission(): Promise<TrackingStatus> {
    try {
      const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      const result = await requestTrackingPermissionsAsync();
      return result.status as TrackingStatus;
    } catch {
      return 'unavailable';
    }
  }
}

export default MetaAdsManager;