import Constants from 'expo-constants';

/**
 * Prefer env var, fall back to value extracted from google-services.json via app.config.js.
 *
 * expo-auth-session uses a browser-based OAuth flow (Chrome Custom Tab on Android).
 * Google's Android-type OAuth clients do NOT support custom URI scheme redirects,
 * so we must use the Web client ID on all platforms for this flow.
 */
export const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.googleWebClientId
  || '';

export const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
