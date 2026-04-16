/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // SECURITY: This key is bundled in the client. Restrict it in Google Cloud Console:
  //   - Application restriction: Android apps (SHA-1 + package) and iOS apps (bundle ID)
  //   - API restriction: Maps SDK for Android, Maps SDK for iOS only
  const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  // Reversed client ID from Google Cloud Console → OAuth 2.0 → iOS client
  // e.g. "com.googleusercontent.apps.XXXXXXX-YYYYYYY"
  const IOS_GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  const PRIVACY_POLICY_URL =
    process.env.EXPO_PUBLIC_PRIVACY_URL ||
    'https://jitplus.com/privacy';

  // Extract Google Web Client ID from google-services.json (single source of truth)
  // to avoid duplicating it in .env and risking divergence.
  let googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  if (!googleWebClientId) {
    try {
      const gs = require('./google-services.json');
      // Web client (type 3) lives in other_platform_oauth_client, not oauth_client
      const oauthClient =
        gs.client?.[0]?.oauth_client?.find((c) => c.client_type === 3) ||
        gs.client?.[0]?.services?.appinvite_service?.other_platform_oauth_client?.find((c) => c.client_type === 3);
      if (oauthClient) googleWebClientId = oauthClient.client_id;
    } catch { /* google-services.json not present — CI/CD will inject via env */ }
  }

  return {
    ...config,
    owner: 'jitplus',
    name: 'JitPlus',
    slug: 'jitplus',
    description: 'Digital loyalty cards app — collect stamps and earn rewards at your favorite local shops.',
    version: '1.3.6',
    orientation: 'portrait',
    icon: './assets/images/icon-white.png',
    scheme: 'jitplus',
    userInterfaceStyle: 'automatic',
    // Publicly accessible privacy policy URL — required by both stores
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    splash: {
      image: './assets/images/jitpluslogo.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.jitplus.client',
      // Initial build number — EAS autoIncrement bumps this on every production build
      buildNumber: '32',
      // Portrait-only app: disable iPad Split View / Slide Over to avoid orientation-support review issues
      requiresFullScreen: true,
      // Firebase config for iOS — download from Firebase Console
      googleServicesFile: './GoogleService-Info.plist',
      // Declare standard-exempt HTTPS encryption → no export compliance questionnaire
      usesNonExemptEncryption: false,
      // Required for push notifications to arrive in background
      backgroundModes: ['remote-notification'],
      config: {
        googleMapsApiKey: GOOGLE_MAPS_KEY,
      },
      infoPlist: {
        // Belt-and-suspenders: explicit Info.plist entry mirrors usesNonExemptEncryption above
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "Permettre à JitPlus d'accéder à votre position pour trouver les commerces autour de vous.",
        // Google Sign-In redirect — reversed iOS client ID
        ...(IOS_GOOGLE_CLIENT_ID
          ? { CFBundleURLTypes: [{ CFBundleURLSchemes: [IOS_GOOGLE_CLIENT_ID] }] }
          : {}),
      },
    },
    android: {
      versionCode: 32,
      icon: './assets/images/icon-white.png',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon-white.png',
        backgroundColor: '#FFFFFF',
      },
      // Disabled: causes native crash on some Android 10/11 devices before
      // the JS bundle loads. Re-enable once targeting Android 15+ exclusively.
      edgeToEdgeEnabled: false,
      // Prevents unexpected back gesture from killing auth/OTP flows
      predictiveBackGestureEnabled: false,
      package: 'com.jitplus.client',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_KEY,
        },
      },
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'VIBRATE',
        // Required for showing push notifications on Android 13+
        'POST_NOTIFICATIONS',
      ],
      // Block excessive auto-injected permissions that trigger Play Console warnings
      blockedPermissions: [
        'android.permission.WRITE_SETTINGS',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/icon-white.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      '@react-native-google-signin/google-signin',
      'expo-apple-authentication',
      [
        'expo-splash-screen',
        {
          image: './assets/images/jitpluslogo.png',
          resizeMode: 'contain',
          backgroundColor: '#FFFFFF',
          imageWidth: 220,
          dark: {
            image: './assets/images/jitpluslogo.png',
            backgroundColor: '#0F172A',
          },
        },
      ],
      // iOS PrivacyInfo.xcprivacy — required since Apple review policy May 2024
      './plugins/withPrivacyManifest',
      // SSL Certificate Pinning — prevents MITM attacks
      // DISABLED: Enable after setting up custom domain (api.jitplus.ma) with managed SSL cert.
      // Cloud Run's *.a.run.app wildcard cert rotates too frequently for pinning.
      // './plugins/withCertificatePinning',
      // Network security — enforces HTTPS, blocks cleartext traffic in production
      './plugins/withNetworkSecurity',
      // Force Google Maps region to Morocco — ensures correct border rendering (Sahara)
      './plugins/withMoroccoRegion',
      [
        'expo-notifications',
        {
          icon: './assets/images/jitpluslogo.png',
          // color removed: setting it here duplicates notification_icon_color
          // with the one already in expo-notifications AAR resources, causing
          // a Gradle mergeReleaseResources conflict. Color is set at runtime
          // via setNotificationChannelAsync in notifications.ts instead.
          defaultChannel: 'jit-marketing',
          sounds: [],
        },
      ],
      [
        'expo-location',
        {
          // WhenInUse only — the app never requests background/always location
          locationWhenInUsePermission:
            "Permettre à JitPlus d'accéder à votre position pour trouver les commerces autour de vous.",
        },
      ],
      // Sentry — source map upload + native crash symbolication
      // Requires EAS Secrets: SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN
      ...(process.env.SENTRY_AUTH_TOKEN ? [['@sentry/react-native/expo', {
        organization: process.env.SENTRY_ORG || '',
        project: process.env.SENTRY_PROJECT || '',
      }]] : []),
    ],
    extra: {
      googleWebClientId,
      eas: {
        projectId: 'cdecb51f-65ff-4e38-a180-bd20563d997c',
      },
    },
    experiments: {
      typedRoutes: true,
    },
  };
};
