import Constants from 'expo-constants';

/** Prefer env var, fall back to value extracted from google-services.json via app.config.js */
export const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.googleWebClientId
  || '';

export const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
export const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
