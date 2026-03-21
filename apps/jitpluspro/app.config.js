/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // SECURITY: This key is bundled in the client. Restrict it in Google Cloud Console:
  //   - Application restriction: Android apps (SHA-1 + package) and iOS apps (bundle ID)
  //   - API restriction: Maps SDK for Android, Maps SDK for iOS only
  const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  // Reversed client ID from Google Cloud Console → OAuth 2.0 → iOS client
  const IOS_GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  const PRIVACY_POLICY_URL =
    process.env.EXPO_PUBLIC_PRIVACY_URL ||
    'https://jitplus.com/privacy';

  // Extract Google Web Client ID from google-services.json (single source of truth)
  let googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  if (!googleWebClientId) {
    try {
      const gs = require('./google-services.json');
      const oauthClient = gs.client?.[0]?.oauth_client?.find((c) => c.client_type === 3);
      if (oauthClient) googleWebClientId = oauthClient.client_id;
    } catch { /* google-services.json not present — CI/CD will inject via env */ }
  }

  return {
    ...config,
    owner: 'ayoub.je',
    name: 'JitPlus Pro',
    slug: 'jitpluspro',
    description: 'Loyalty program management for local shops — scan QR codes, track customer visits, and set up stamp-based rewards.',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon-white.png',
    scheme: 'jitpluspro',
    userInterfaceStyle: 'automatic',
    // Required by both stores — must be a publicly accessible URL
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    splash: {
      image: './assets/images/jitplusprologo.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.jitplus.pro',
      // Initial build number — EAS autoIncrement bumps this on every production build
      buildNumber: '1',
      // Portrait-only app: disable iPad Split View / Slide Over to avoid orientation-support review issues
      requiresFullScreen: true,
      // Declares standard HTTPS encryption — waives export compliance questionnaire
      usesNonExemptEncryption: false,
      // Required for push notifications to arrive when app is in background
      backgroundModes: ['remote-notification'],
      config: {
        googleMapsApiKey: GOOGLE_MAPS_KEY,
      },
      infoPlist: {
        // Belt-and-suspenders: explicit Info.plist entry mirrors usesNonExemptEncryption above
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          "JitPlus Pro a besoin d'accéder à votre caméra pour scanner les codes QR de vos clients.",
        // Only declare foreground location — app never requests background location
        NSLocationWhenInUseUsageDescription:
          'JitPlus Pro utilise votre position pour localiser votre commerce sur la carte.',
        // App only reads from the library (logo/cover upload) — never writes to it, so
        // NSPhotoLibraryAddUsageDescription is intentionally omitted.
        NSPhotoLibraryUsageDescription:
          "JitPlus Pro a besoin d'accéder à vos photos pour choisir le logo et la couverture de votre commerce.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon-white.png',
        backgroundColor: '#FFFFFF',
      },
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_KEY,
        },
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        'CAMERA',
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        // Required for push notifications on Android 13+
        'POST_NOTIFICATIONS',
        // Required for vibration on notification arrival
        'VIBRATE',
        // Required for expo-image-picker on Android 13+ (replaces READ_EXTERNAL_STORAGE)
        'READ_MEDIA_IMAGES',
      ],
      package: 'com.jitplus.pro',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/icon-white.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      // Disable microphone permission — app only uses camera for QR scanning, never video recording
      [
        'expo-camera',
        {
          cameraPermission:
            "JitPlus Pro a besoin d'accéder à votre caméra pour scanner les codes QR de vos clients.",
          microphonePermission: false,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            "JitPlus Pro accède à votre médiathèque pour personnaliser le logo et la couverture de votre commerce.",
          cameraPermission:
            "JitPlus Pro a besoin d'accéder à votre caméra pour capturer le logo de votre commerce.",
          microphonePermission: false,
        },
      ],
      // iOS PrivacyInfo.xcprivacy — required since Apple review policy May 2024
        // './plugins/withPrivacyManifest',
      // SSL Certificate Pinning — prevents MITM attacks
      // DISABLED: Enable after setting up custom domain (api.jitplus.ma) with managed SSL cert.
      // Cloud Run's *.a.run.app wildcard cert rotates too frequently for pinning.
      // './plugins/withCertificatePinning',
      // Network security — enforces HTTPS, blocks cleartext traffic in production
      './plugins/withNetworkSecurity',
      // Force Google Maps region to Morocco — ensures correct border rendering (Sahara)
      // './plugins/withMoroccoRegion',
      [
        'expo-notifications',
        {
          icon: './assets/images/jitplusprologo.png',
          color: '#7C3AED',
          defaultChannel: 'jitpro-default',
          sounds: [],
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            "Permettre à JitPlus Pro d'accéder à votre position pour localiser votre commerce.",
        },
      ],
      // Sentry — source map upload + native crash symbolication
      // Requires EAS Secrets: SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN
      ['@sentry/react-native/expo', {
        organization: process.env.SENTRY_ORG || '',
        project: process.env.SENTRY_PROJECT || '',
      }],
    ],
    extra: {
      googleMapsApiKey: GOOGLE_MAPS_KEY,
      googleWebClientId,
      eas: {
        projectId: '7c70faf4-4ef0-494b-aef1-a2b86be3ce57',
      },
    },
    experiments: {
      typedRoutes: true,
    },
    privacy: 'public',
    platforms: ['ios', 'android'],
  };
};
