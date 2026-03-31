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

export const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
