/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // SECURITY: This key is bundled in the client. Restrict it in Google Cloud Console:
  //   - Application restriction: Android apps (SHA-1 + package) and iOS apps (bundle ID)
  //   - API restriction: Maps SDK for Android, Maps SDK for iOS, Geocoding API, Places API
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
    owner: 'jitplus',
    name: 'JitPlus Pro',
    slug: 'jitpluspro',
    description: 'Loyalty program management for local shops — scan QR codes, track customer visits, and set up stamp-based rewards.',
    version: '1.3.0',
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
      buildNumber: '2',
      // Portrait-only app: disable iPad Split View / Slide Over to avoid orientation-support review issues
      requiresFullScreen: true,
      // Declares standard HTTPS encryption — waives export compliance questionnaire
      usesNonExemptEncryption: false,
      // Required for push notifications to arrive when app is in background
      backgroundModes: ['remote-notification'],
      // Firebase config for iOS — download from Firebase Console → Project Settings → iOS app
      googleServicesFile: './GoogleService-Info.plist',
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
        // Google Sign-In redirect — reversed iOS client ID
        ...(IOS_GOOGLE_CLIENT_ID
          ? { CFBundleURLTypes: [{ CFBundleURLSchemes: [IOS_GOOGLE_CLIENT_ID] }] }
          : {}),
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
      // edgeToEdgeEnabled disabled: causes native crash on some Android 10/11 devices
      // before the JS bundle loads (no visible error message). Re-enable once
      // targeting Android 15+ exclusively.
      edgeToEdgeEnabled: false,
      // Disabled: prevents accidental back gesture from killing auth/OTP/onboarding flows
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
      '@react-native-google-signin/google-signin',
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
      './plugins/withPrivacyManifest',
      // Network security — enforces HTTPS, blocks cleartext traffic in production
      './plugins/withNetworkSecurity',
      // SSL Certificate Pinning — prevents MITM attacks (must be AFTER withNetworkSecurity)
      // DISABLED: Pins are still placeholders. Enable once api.jitplus.com has a stable
      // managed SSL certificate. Cloud Run *.a.run.app certs rotate too frequently.
      // './plugins/withCertificatePinning',
      // Force Google Maps region to Morocco — ensures correct border rendering (Sahara)
      // './plugins/withMoroccoRegion',
      [
        'expo-notifications',
        {
          icon: './assets/images/jitplusprologo.png',
          // color removed: setting it here duplicates notification_icon_color
          // with the one already in expo-notifications AAR resources, causing
          // a Gradle mergeReleaseResources conflict. Color is set at runtime
          // via setNotificationChannelAsync in notifications.ts instead.
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
      // Sentry — always register the config plugin so the native SDK is properly
      // set up.  Source-map / symbol uploads happen ONLY when SENTRY_AUTH_TOKEN is set.
      ['@sentry/react-native/expo', {
        organization: process.env.SENTRY_ORG || 'placeholder',
        project: process.env.SENTRY_PROJECT || 'placeholder',
        uploadNativeSymbols: false,
        autoUploadReactNativeBundles: false,
      }],
    ],
    extra: {
      googleMapsApiKey: GOOGLE_MAPS_KEY,
      googleWebClientId,
      eas: {
        projectId: '35d9da23-1ebd-4c2e-9deb-dc659893a4da',
      },
    },
    experiments: {
      typedRoutes: true,
    },
    privacy: 'public',
    platforms: ['ios', 'android'],
  };
};
