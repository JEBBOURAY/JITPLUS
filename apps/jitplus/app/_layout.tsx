import React, { useEffect, useRef, useState } from 'react';
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

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
import { useRealtimeEvents, handleFcmDataPayload, useAppForegroundRefresh } from '@/hooks/useRealtimeEvents';
import { api, getServerBaseUrl } from '@/services/api';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { setupAndroidChannel } from '@/utils/notifications';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import ForceUpdateModal from '@/components/ForceUpdateModal';

// ── Sentry init (crash reporting) ──────────────────────────────
// SECURITY: DSN is bundled in the client. Configure inbound data filters in
// Sentry project settings to reject invalid releases and apply rate limits.
// Validate DSN format before init — an unresolved EAS secret (literal "$...") or
// empty string would make the native SDK crash on Android.
const _sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const _sentryEnabled =
  !__DEV__ &&
  !!_sentryDsn &&
  _sentryDsn.startsWith('https://') &&
  _sentryDsn.includes('.sentry.io');
Sentry.init({
  dsn: _sentryEnabled ? _sentryDsn : '',
  enabled: _sentryEnabled,
  environment: __DEV__ ? 'development' : 'production',
  release: Constants.expoConfig?.version,
  dist: String(
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber ?? '0'
      : Constants.expoConfig?.android?.versionCode ?? '0'
  ),
  tracesSampleRate: 0.05,
  maxBreadcrumbs: 20,
  attachScreenshot: false, // Disabled: screenshots can capture PII (names, cards, balances)
  attachViewHierarchy: false,
  ignoreErrors: [
    'No refresh token',
    'Session expired',
    'Network Error',
    'ECONNABORTED',
  ],
  beforeSend(event) {
    // Suppress expected auth-failure errors that are already handled by the app
    const msg = event.exception?.values?.[0]?.value ?? '';
    if (/No refresh token|Session expired/i.test(msg)) return null;
    return event;
  },
});

// ── End Sentry init ────────────────────────────────

// ── Global unhandled promise rejection handler ──────────────────
// Catches fire-and-forget .then() without .catch() and logs to Sentry.
if (typeof globalThis !== 'undefined') {
  const originalHandler = (globalThis as any).onunhandledrejection;
  (globalThis as any).onunhandledrejection = (event: any) => {
    const error = event?.reason;
    if (!__DEV__ && error) {
      // Skip expected auth failures — already handled by onAuthFailure / onUnauthorized
      const msg = error?.message ?? '';
      if (!/No refresh token|Session expired/i.test(msg)) {
        Sentry.captureException(error, { tags: { source: 'unhandled-promise' } });
      }
    }
    if (originalHandler) originalHandler(event);
  };
}

// ── Env validation (warn in production — never crash the app) ───
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  Sentry.captureMessage('EXPO_PUBLIC_API_URL is missing in production', 'error');
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

// SECURITY: Reduced from 24h to 4h to limit data exposure window if device is
// seized/rooted. AsyncStorage is unencrypted — shorter TTL = less recoverable data.
const CACHE_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours

// Skip expected HTTP 4xx errors (business/validation failures) from Sentry.
// Only report 5xx, network errors, and non-HTTP errors.
function isServerOrNetworkError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return !status || status >= 500;
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (!__DEV__ && isServerOrNetworkError(error)) {
        Sentry.captureException(error, { tags: { source: 'react-query' } });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (!__DEV__ && isServerOrNetworkError(error)) {
        Sentry.captureException(error, { tags: { source: 'react-query-mutation' } });
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: false,
      // Must be >= persister maxAge so the in-memory cache isn't garbage-
      // collected before the persister considers it valid.
      gcTime: CACHE_MAX_AGE,
      // Re-fetch stale queries after a network reconnection (e.g. offline → 4G).
      // 'stale' avoids re-fetching all queries — only stale ones are refreshed.
      refetchOnReconnect: true,
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
  const { status: forceUpdateStatus, storeUrl: forceUpdateStoreUrl } = useForceUpdate();
  const { locale } = useLanguage();

  // Redirect to welcome screen whenever the user logs out (client becomes null)
  useEffect(() => {
    if (!client) {
      router.replace('/welcome');
    }
  }, [client, router]);

  // Sync local language preference to backend once when client is authenticated
  useEffect(() => {
    if (client && locale) {
      api.updateProfile({ language: locale }).catch(() => {});
    }
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Route notification tap to the correct screen based on event type
    const navigateByAction = (data?: Record<string, string>) => {
      try {
        const event = data?.event;
        const action = data?.action;
        const merchantId = data?.merchantId;

        // Handle action-based deep links from automated campaigns
        if (action) {
          switch (action) {
            case 'open_explore':
              router.push('/(tabs)/discover');
              return;
            case 'open_scan':
              router.push('/(tabs)/qr');
              return;
            case 'open_referral':
              router.push('/referral');
              return;
            case 'open_cards':
              router.push('/(tabs)');
              return;
            case 'open_card':
              if (merchantId) {
                router.push({ pathname: '/merchant/[id]', params: { id: merchantId } });
                return;
              }
              router.push('/(tabs)');
              return;
            case 'open_notifications':
              router.push('/(tabs)/notifications');
              return;
          }
        }

        // Handle event-based navigation (transactional notifications)
        switch (event) {
          case 'points_updated':
          case 'reward_available':
          case 'reward_redeemed':
            if (merchantId) {
              router.push({ pathname: '/merchant/[id]', params: { id: merchantId } });
            } else {
              router.push('/(tabs)/notifications');
            }
            break;
          default:
            router.push('/(tabs)/notifications');
            break;
        }
      } catch (e) { if (__DEV__) console.warn('Navigation failed', e); }
    };

    // Listen for push token changes (FCM rotation) — re-register with backend
    const tokenSub = Notifications.addPushTokenListener(({ data: newToken }) => {
      if (__DEV__) console.log('Push token rotated, re-registering');
      api.updatePushToken(newToken as string).catch(() => {});
    });

    // Reset iOS badge count on app open
    Notifications.setBadgeCountAsync(0).catch(() => {});

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
      Notifications!.setBadgeCountAsync(0).catch(() => {});
      // Invalidate caches from FCM data payload for instant feed update
      const tapData = response.notification.request.content.data as Record<string, string> | undefined;
      handleFcmDataPayload(tapData, queryClient);
      navigateByAction(tapData);
    });

    // Handle cold-start: app was killed, user tapped a notification to launch it
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const coldData = response.notification.request.content.data as Record<string, string> | undefined;
        handleFcmDataPayload(coldData, queryClient);
        navigateByAction(coldData);
      }
    });

    return () => {
      tokenSub.remove();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router, queryClient]);

  const { isDark } = theme;

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1, direction: 'ltr' }}>
      <OfflineBanner />
      {(forceUpdateStatus === 'update' || forceUpdateStatus === 'maintenance') && (
        <ForceUpdateModal status={forceUpdateStatus} storeUrl={forceUpdateStoreUrl} />
      )}
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
      </View>
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

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) {
      // In production, report but don't throw — the app can render with system fonts
      if (__DEV__) throw error;
      Sentry.captureException(error, { tags: { source: 'font-loading' } });
    }
  }, [error]);

  // Font loading timeout — don't block app launch forever if fonts fail
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontTimeout(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Set up Android notification channels as early as possible — before auth
  // resolves, so FCM notifications arriving before login are not silently
  // dropped because the channel doesn't exist yet.
  useEffect(() => {
    setupAndroidChannel().catch(() => {});
  }, []);

  // Don't render anything until fonts are loaded — SplashGate handles hideAsync
  if (!loaded && !fontTimeout && !error) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          maxAge: CACHE_MAX_AGE,
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
    </SafeAreaProvider>
  );
}
