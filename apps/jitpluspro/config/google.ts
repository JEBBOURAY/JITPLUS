import Constants from 'expo-constants';

/**
 * Google OAuth client IDs for @react-native-google-signin/google-signin.
 *
 * The Web Client ID is required so the native SDK returns an id_token
 * (audience = web client) which the backend can verify.
 */
export const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.googleWebClientId
  || '';

if (!WEB_CLIENT_ID && !__DEV__) {
  console.error('[CONFIG] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is required in production — Google Sign-In will not work');
}

export const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
