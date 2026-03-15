/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // SECURITY: This key is bundled in the client. Restrict it in Google Cloud Console:
  //   - Application restriction: Android apps (SHA-1 + package) and iOS apps (bundle ID)
  //   - API restriction: Maps SDK for Android, Maps SDK for iOS only
  const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  // Reversed client ID from Google Cloud Console → OAuth 2.0 → iOS client
  // e.g. "com.googleusercontent.apps.XXXXXXX-YYYYYYY"
  const IOS_GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  const PRIVACY_POLICY_URL = 'https://jitplus.com/privacy';

  // Extract Google Web Client ID from google-services.json (single source of truth)
  // to avoid duplicating it in .env and risking divergence.
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
    owner: 'ajebbour',
    name: 'JitPlus',
    slug: 'jitplus',
    version: '1.1.0',
    orientation: 'portrait',
    icon: './assets/images/jitpluslogo.png',
    scheme: 'jitplus',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    // Publicly accessible privacy policy URL — required by both stores
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    splash: {
      image: './assets/images/jitpluslogo.png',
      resizeMode: 'contain',
      backgroundColor: '#7C3AED',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.jitplus.client',
      // Firebase config for iOS — download from Firebase Console
      googleServicesFile: './GoogleService-Info.plist',
      // Declare standard-exempt HTTPS encryption → no export compliance questionnaire
      usesNonExemptEncryption: false,
      // Required for push notifications to arrive in background
      backgroundModes: ['remote-notification'],
      // URL schemes: app deep-link + Google OAuth reversed client ID redirect
      ...(IOS_GOOGLE_CLIENT_ID
        ? { infoPlist: {
            NSLocationWhenInUseUsageDescription:
              "Permettre à JitPlus d'accéder à votre position pour trouver les commerces autour de vous.",
            // Google Sign-In redirect — reversed iOS client ID
            CFBundleURLTypes: [
              { CFBundleURLSchemes: [IOS_GOOGLE_CLIENT_ID] },
            ],
          }}
        : { infoPlist: {
            NSLocationWhenInUseUsageDescription:
              "Permettre à JitPlus d'accéder à votre position pour trouver les commerces autour de vous.",
          }}
      ),
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/jitpluslogo.png',
        backgroundColor: '#7C3AED',
      },
      edgeToEdgeEnabled: true,
      // Prevents unexpected back gesture from killing auth/OTP flows
      predictiveBackGestureEnabled: false,
      package: 'com.jitplus.client',
      googleServicesFile: './google-services.json',
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
      favicon: './assets/images/jitpluslogo.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      // iOS PrivacyInfo.xcprivacy — required since Apple review policy May 2024
      './plugins/withPrivacyManifest',
      // SSL Certificate Pinning — prevents MITM attacks
      // DISABLED: Enable after generating real pin hashes from api.jitplus.ma SSL cert
      // './plugins/withCertificatePinning',
      // Force Google Maps region to Morocco — ensures correct border rendering (Sahara)
      './plugins/withMoroccoRegion',
      [
        'expo-notifications',
        {
          icon: './assets/images/jitpluslogo.png',
          color: '#7C3AED',
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
      // Sentry — enable when SENTRY_ORG, SENTRY_PROJECT, and SENTRY_AUTH_TOKEN are configured
      // ['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG || '', project: process.env.SENTRY_PROJECT || '' }],
    ],
    extra: {
      googleWebClientId,
      eas: {
        projectId: '6c072b5e-4a1e-4ede-b3f2-7c26ddbde238',
      },
    },
    experiments: {
      typedRoutes: true,
    },
  };
};
