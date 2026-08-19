/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // SECURITY: This key is bundled in the client. Restrict it in Google Cloud Console:
  //   - Application restriction: Android apps (SHA-1 + package) and iOS apps (bundle ID)
  //   - API restriction: Maps SDK for Android, Maps SDK for iOS, Geocoding API, Places API
  // Platform-specific keys take precedence; fall back to the shared key injected by EAS.
  const GOOGLE_MAPS_KEY_SHARED = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const GOOGLE_MAPS_KEY_ANDROID =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID || GOOGLE_MAPS_KEY_SHARED;
  const GOOGLE_MAPS_KEY_IOS =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS || GOOGLE_MAPS_KEY_SHARED;
  // Reversed client ID from Google Cloud Console → OAuth 2.0 → iOS client
  const IOS_GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID || '2706696686345947';
  const META_CLIENT_TOKEN = process.env.EXPO_PUBLIC_META_CLIENT_TOKEN || '';
  const META_DISPLAY_NAME = process.env.EXPO_PUBLIC_META_DISPLAY_NAME || 'JitPlus Pro';
  const PRIVACY_POLICY_URL =
    process.env.EXPO_PUBLIC_PRIVACY_URL ||
    'https://jitplus.com/privacy';

  // Extract Google Web Client ID from google-services.json (single source of truth)
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
    name: 'JitPlus Pro',
    slug: 'jitpluspro',
    description: 'Loyalty program management for local shops — scan QR codes, track customer visits, and set up stamp-based rewards.',
    version: '1.5.20',
    orientation: 'portrait',
    icon: './assets/images/icon-white.png',
    scheme: 'jitpluspro',
    userInterfaceStyle: 'automatic',
    updates: {
      url: 'https://u.expo.dev/35d9da23-1ebd-4c2e-9deb-dc659893a4da'
    },
    runtimeVersion: {
      policy: 'appVersion'
    },
    // Required by both stores — must be a publicly accessible URL
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    splash: {
      image: './assets/images/jitplusprologo.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.jitplus.pro',
      // Initial build number — EAS autoIncrement bumps this on every production build
      buildNumber: '33',
      // Portrait-only app: disable iPad Split View / Slide Over to avoid orientation-support review issues
      requiresFullScreen: true,
      // Declares standard HTTPS encryption — waives export compliance questionnaire
      usesNonExemptEncryption: false,
      // Required for push notifications to arrive when app is in background
      backgroundModes: ['remote-notification'],
      // Firebase config for iOS — download from Firebase Console → Project Settings → iOS app
      googleServicesFile: './GoogleService-Info.plist',
      config: {
        googleMapsApiKey: GOOGLE_MAPS_KEY_IOS,
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
        FacebookAppID: META_APP_ID,
        FacebookClientToken: META_CLIENT_TOKEN,
        FacebookDisplayName: META_DISPLAY_NAME,
        NSUserTrackingUsageDescription:
          'Cette autorisation permet a JitPlus Pro de mesurer les performances des campagnes publicitaires et d ameliorer l acquisition de clients.',
        SKAdNetworkItems: [
          { SKAdNetworkIdentifier: 'v9wttpbfk9.skadnetwork' },
          { SKAdNetworkIdentifier: 'n38lu8286q.skadnetwork' },
        ],
        // Google Sign-In redirect — reversed iOS client ID
        ...(IOS_GOOGLE_CLIENT_ID
          ? { CFBundleURLTypes: [{ CFBundleURLSchemes: [IOS_GOOGLE_CLIENT_ID] }] }
          : {}),
      },
      // Deep links: Universal Links — DISABLED for v1.0
      // To re-enable: add the "Associated Domains" capability to the App ID
      // `com.jitplus.pro` in https://developer.apple.com/account/resources/identifiers/list,
      // then run `eas credentials -p ios` and regenerate the provisioning profile.
      // associatedDomains: [
      //   'applinks:jitplus-api-290470991104.europe-west9.run.app',
      // ],
    },
    android: {
      versionCode: 35,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon-white.png',
        backgroundColor: '#FFFFFF',
      },
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_KEY_ANDROID,
        },
      },
      // Re-enabled for Android 15+ Edge-to-Edge compliance (targetSdkVersion 35)
      edgeToEdgeEnabled: true,
      // Disabled: prevents accidental back gesture from killing auth/OTP/onboarding flows
      predictiveBackGestureEnabled: false,
      permissions: [
        'CAMERA',
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        // Required for push notifications on Android 13+
        'POST_NOTIFICATIONS',
        // Required for Meta Ads SDK tracking attribution on Android 13+
        'com.google.android.gms.permission.AD_ID',
        // Required for vibration on notification arrival
        'VIBRATE',
        // READ_MEDIA_IMAGES intentionally NOT requested: expo-image-picker v17+
        // falls back to the system Photo Picker (Android 13+, no permission
        // needed) when the legacy permission isn't granted. This satisfies
        // Google Play's "Photos and videos permission" policy for apps that
        // only need occasional image selection (logo / cover upload).
      ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'jitplus-api-290470991104.europe-west9.run.app',
              pathPrefix: '/pro/referral',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      // Block excessive auto-injected permissions that trigger Play Console warnings
      blockedPermissions: [
        'android.permission.WRITE_SETTINGS',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        // Force the system Photo Picker path — Play Policy compliance.
        // READ_MEDIA_VISUAL_USER_SELECTED is intentionally NOT blocked: it's
        // the granular Android 14+ replacement and is policy-compliant.
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
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
      [
        'react-native-fbsdk-next',
        {
          appID: META_APP_ID,
          clientToken: META_CLIENT_TOKEN,
          displayName: META_DISPLAY_NAME,
          scheme: `fb${META_APP_ID}`,
          autoLogAppEventsEnabled: true,
          advertiserIDCollectionEnabled: true,
          isAutoInitEnabled: true,
        },
      ],
      '@react-native-google-signin/google-signin',
      'expo-apple-authentication',
      // Explicit iOS / Android SDK targets — avoids surprises on Expo SDK bumps
      // and satisfies Google Play's Android 16 requirement for targetSdkVersion 36.
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '15.1',
          },
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            minSdkVersion: 24,
            buildToolsVersion: '35.0.0',
          },
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/jitplusprologo.png',
          resizeMode: 'contain',
          backgroundColor: '#FFFFFF',
          imageWidth: 220,
          dark: {
            image: './assets/images/jitplusprologo.png',
            backgroundColor: '#0F172A',
          },
        },
      ],
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
      './plugins/withMoroccoRegion',
      // Enable RTL support on Android — required for Arabic/Darija layout
      './plugins/withSupportsRTL',
      // Force modular headers for GoogleUtilities/RecaptchaInterop so Swift pod
      // AppCheckCore (pulled in by GoogleSignIn 9) can import them.
      './plugins/withGoogleModularHeaders',
      // Disable Swift 6 strict concurrency for all pods (Xcode 26 + expo-image@55.0.9 incompat)
      './plugins/withDisableStrictConcurrency',
      // iOS Notification Service Extension — temporarily disabled for v1.4.3.
      // Xcode 16/26 reports "Unexpected duplicate tasks" during archive (likely
      // duplicated Info.plist processing). Android already shows notification
      // images natively; iOS will fall back to text-only push until the plugin
      // is reworked (e.g. via @bacons/apple-targets or OneSignal NSE pattern).
      // './plugins/withNotificationServiceExtension',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
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
      // Sentry — build-time dSYM/Hermes/source-map upload so App Hangs & crashes
      // are SYMBOLICATED. Gated so a missing auth token never breaks the build.
      // DSN is in the EU region (ingest.de.sentry.io) → sentry-cli MUST target
      // https://de.sentry.io/ (via SENTRY_URL) or uploads silently 401/404.
      // Requires EAS secret SENTRY_AUTH_TOKEN + env SENTRY_ORG/SENTRY_PROJECT/
      // SENTRY_URL/SENTRY_ENABLE_BUILD_UPLOAD=true (see eas.json production).
      // Manual upload for an already-shipped build:
      //   npx sentry-cli --url https://de.sentry.io/ debug-files upload \
      //     -o jitplus -p jitpluspro-mobile <path-to-dSYMs-and-Frameworks>
      ...(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ENABLE_BUILD_UPLOAD === 'true'
        ? [['@sentry/react-native/expo', {
            organization: process.env.SENTRY_ORG || '',
            project: process.env.SENTRY_PROJECT || '',
            url: process.env.SENTRY_URL || 'https://de.sentry.io/',
          }]]
        : []),
    ],
    extra: {
      googleMapsApiKeyAndroid: GOOGLE_MAPS_KEY_ANDROID,
      googleMapsApiKeyIos: GOOGLE_MAPS_KEY_IOS,
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
