import React, { useEffect, useRef } from 'react';
import { Platform, View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold } from '@expo-google-fonts/lexend';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryCache, MutationCache, onlineManager, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister } from '@/utils/queryPersister';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
import { useRealtimeEvents, handleFcmDataPayload, useAppForegroundRefresh } from '@/hooks/useRealtimeEvents';
import { getServerBaseUrl } from '@/services/api';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { setupAndroidChannel } from '@/utils/notifications';

// ── Sentry init (crash reporting) ──────────────────────────────
// SECURITY: DSN is bundled in the client. Configure inbound data filters in
// Sentry project settings to reject invalid releases and apply rate limits.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  release: Constants.expoConfig?.version,
  dist: String(Constants.expoConfig?.android?.versionCode ?? '0'),
  tracesSampleRate: 0.2,
  maxBreadcrumbs: 50,
  attachScreenshot: false, // Disabled: screenshots can capture PII (names, cards, balances)
  attachViewHierarchy: false,
});
// ── End Sentry init ────────────────────────────────

// ── Global unhandled promise rejection handler ──────────────────
// Catches fire-and-forget .then() without .catch() and logs to Sentry.
if (typeof globalThis !== 'undefined') {
  const originalHandler = (globalThis as any).onunhandledrejection;
  (globalThis as any).onunhandledrejection = (event: any) => {
    const error = event?.reason;
    if (!__DEV__ && error) {
      Sentry.captureException(error, { tags: { source: 'unhandled-promise' } });
    }
    if (originalHandler) originalHandler(event);
  };
}

// ── Env validation (fail-fast in production) ────────────────────
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  throw new Error('[CONFIG] EXPO_PUBLIC_API_URL is required in production');
}

const isExpoGo = Constants.appOwnership === 'expo';

// Only load expo-notifications outside Expo Go — importing it triggers
// push-token side-effects that crash in Expo Go SDK 53+.
let Notifications: typeof import('expo-notifications') | null = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
  } catch (e) { if (__DEV__) console.warn('expo-notifications unavailable', e); }
}

SplashScreen.preventAutoHideAsync();

// Sync React Query's online state with NetInfo — pauses mutations offline
// and auto-replays them on reconnect.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (!__DEV__) Sentry.captureException(error, { tags: { source: 'react-query' } });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (!__DEV__) Sentry.captureException(error, { tags: { source: 'react-query-mutation' } });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      // Must be >= persister maxAge so the in-memory cache isn't garbage-
      // collected before the persister considers it valid.
      gcTime: TWENTY_FOUR_HOURS,
      // Always re-fetch after a network reconnection so data is fresh
      // after the app comes back online (e.g. offline → 4G transition).
      refetchOnReconnect: 'always',
    },
  },
});

function RootLayoutNav() {
  const theme = useTheme();
  const router = useRouter();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const notificationListener = useRef<{ remove(): void } | null>(null);
  const responseListener = useRef<{ remove(): void } | null>(null);

  // Redirect to welcome screen whenever the user logs out (client becomes null)
  useEffect(() => {
    if (!client) {
      router.replace('/welcome');
    }
  }, [client, router]);

  // ── Real-time WebSocket connection ────────────────────────
  const socket = useRealtimeSocket({
    serverUrl: getServerBaseUrl(),
    getToken: async () => {
      if (Platform.OS === 'web') return null;
      try { return await SecureStore.getItemAsync('auth_token'); } catch { return null; }
    },
    enabled: !!client,
  });

  // Listen for WS events and auto-invalidate React Query cache
  useRealtimeEvents(socket);

  // Invalidate notification caches when app returns from background
  useAppForegroundRefresh();



  useEffect(() => {
    // Skip notification listeners in Expo Go (SDK 53+ removed push support)
    if (!Notifications || isExpoGo) return;

    // Listen for incoming notifications while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log('Notification received:', notification.request.content);
      // Instantly invalidate cache from FCM data payload (fallback for when WS is offline)
      const data = notification.request.content.data as Record<string, string> | undefined;
      handleFcmDataPayload(data, queryClient);
    });

    // Listen for notification taps (user interacted with the notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) console.log('Notification tapped:', response.notification.request.content);
      // Invalidate caches from FCM data payload for instant feed update
      const tapData = response.notification.request.content.data as Record<string, string> | undefined;
      handleFcmDataPayload(tapData, queryClient);
      // Navigate to notifications tab when user taps a notification
      try {
        router.push('/(tabs)/notifications');
      } catch (e) { if (__DEV__) console.warn('Navigation failed', e); }
    });

    // Handle cold-start: app was killed, user tapped a notification to launch it
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const coldData = response.notification.request.content.data as Record<string, string> | undefined;
        handleFcmDataPayload(coldData, queryClient);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router, queryClient]);

  const { isDark } = theme;

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <OfflineBanner />
      <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="login" options={{ animation: 'fade', contentStyle: { backgroundColor: '#fff' } }} />
          <Stack.Screen name="register" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#fff' } }} />
          <Stack.Screen name="verify-otp" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="complete-profile" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="set-password" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#fff' } }} />
          <Stack.Screen name="change-password" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="referral" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="legal" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </ErrorBoundary>
    </NavThemeProvider>
  );
}

/** Hides splash once auth state is ready (fonts are already guaranteed loaded by the parent guard). */
function SplashGate({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      SplashScreen.hideAsync();
    }
  }, [authLoading]);

  if (authLoading) return null;
  return <>{children}</>;
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
  spinner: {
    marginTop: 24,
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
    SpaceMono: require('@/assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Set up Android notification channels as early as possible — before auth
  // resolves, so FCM notifications arriving before login are not silently
  // dropped because the channel doesn't exist yet.
  useEffect(() => {
    setupAndroidChannel().catch(() => {});
  }, []);

  // Don't render anything until fonts are loaded — SplashGate handles hideAsync
  if (!loaded) {
    return null;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: TWENTY_FOUR_HOURS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' &&
            // Geo queries change with every map pan — not worth persisting
            !query.queryKey.includes('merchants-nearby') &&
            // Never persist sensitive data (profile, auth, tokens, etc.)
            !['profile', 'auth', 'token', 'otp', 'password'].includes(
              String(query.queryKey[0] ?? '').toLowerCase(),
            ),
        },
      }}
    >
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <SplashGate>
              <RootLayoutNav />
            </SplashGate>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </PersistQueryClientProvider>
  );
}
