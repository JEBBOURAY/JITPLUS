import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold } from '@expo-google-fonts/lexend';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryCache, MutationCache, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister } from '@/utils/queryPersister';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { getServerBaseUrl } from '@/services/api';
import { logError } from '@/utils/devLogger';
import * as Sentry from '@sentry/react-native';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      logError('ReactQuery', `Query failed [${String(query.queryKey)}]`, error);
      if (!__DEV__) Sentry.captureException(error, { tags: { source: 'react-query' } });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      logError('Mutation', `Mutation failed [${String(mutation.options.mutationKey ?? 'anonymous')}]`, error);
      if (!__DEV__) Sentry.captureException(error, { tags: { source: 'react-query-mutation' } });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 2 * 60 * 1000,
      // Must be >= persister maxAge so in-memory cache isn't GC'd
      // before the persister considers it valid.
      gcTime: TWENTY_FOUR_HOURS,
    },
  },
});

// ── Sentry init (crash reporting) ──────────────────────────────
// SECURITY: DSN is bundled in the client. Configure inbound data filters in
// Sentry project settings to reject invalid releases and apply rate limits.
try {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN_PRO ?? '',
    enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN_PRO,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version,
    dist: String(Constants.expoConfig?.android?.versionCode ?? '0'),
    tracesSampleRate: 0.2,
    maxBreadcrumbs: 50,
    attachScreenshot: false, // Disabled: screenshots can capture PII (names, cards, balances)
    attachViewHierarchy: false, // Disabled: view hierarchy can leak PII
  });
} catch (e) {
  // Sentry init can crash if native module is misconfigured — never block app launch
  if (__DEV__) console.warn('[Sentry] init failed:', e);
}
// ── End Sentry init ────────────────────────────────

// ── Global unhandled promise rejection handler ──────────────────
// Catches fire-and-forget .then() without .catch() and logs to Sentry.
if (typeof globalThis !== 'undefined') {
  const originalHandler = (globalThis as any).onunhandledrejection;
  (globalThis as any).onunhandledrejection = (event: any) => {
    const error = event?.reason;
    if (!__DEV__ && error) {
      try { Sentry.captureException(error, { tags: { source: 'unhandled-promise' } }); } catch {}
    }
    if (originalHandler) originalHandler(event);
  };
}

// ── Env validation (fail-fast in production) ────────────────────
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  // Log instead of throw — crashing at module-level gives no visible error message
  console.error('[CONFIG] EXPO_PUBLIC_API_URL is required in production');
}

// NOTE: The I18nManager forced-LTR reset has been removed.
// React Native persists the direction set by I18nManager.forceRTL across
// relaunches. The LanguageContext handles direction changes with an app-restart
// prompt, allowing Arabic (RTL) to work correctly.

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { Notifications, isExpoGo, setupAndroidChannels } from '@/utils/notifications';
import AppErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import ForceUpdateModal from '@/components/ForceUpdateModal';
import { useForceUpdate } from '@/hooks/useForceUpdate';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

/**
 * SplashGate — waits for AuthProvider to finish loading before
 * hiding the splash screen. Shows a branded loading screen.
 */
function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={splashStyles.container}>
        <Image
          source={require('@/assets/images/jitplusprologo.png')}
          style={splashStyles.logo}
          resizeMode="contain"
        />
        <ActivityIndicator size="small" color="#7C3AED" style={splashStyles.spinner} />
      </View>
    );
  }

  return <>{children}</>;
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1F2937',
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

function RootLayoutNav() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          maxAge: TWENTY_FOUR_HOURS,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.state.status === 'success' &&
              // Never persist sensitive data (profile, auth, tokens, etc.)
              !['profile', 'auth', 'token', 'otp', 'password', 'session', 'credentials'].includes(
                String(query.queryKey[0] ?? '').toLowerCase(),
              ),
          },
        }}
      >
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
          <SplashGate>
            <ThemedNavigator />
          </SplashGate>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
      </PersistQueryClientProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

function ThemedNavigator() {
  const theme = useTheme();
  const { isDark } = theme;
  const { merchant } = useAuth();
  const { status, storeUrl } = useForceUpdate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notificationListener = useRef<{ remove(): void } | null>(null);
  const responseListener = useRef<{ remove(): void } | null>(null);

  // ── Real-time WebSocket connection ────────────────────────
  const socket = useRealtimeSocket({
    serverUrl: getServerBaseUrl(),
    getToken: () => SecureStore.getItemAsync('accessToken'),
    enabled: !!merchant,
  });
  useRealtimeEvents(socket);

  // ── Android notification channels + FCM listeners ─────────
  useEffect(() => {
    setupAndroidChannels();
  }, []);

  useEffect(() => {
    if (!Notifications || isExpoGo) return;

    // Show notifications in foreground is handled by setNotificationHandler
    // in utils/notifications.ts. Here we listen for received + tapped events.

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log('[Pro] Notification received:', notification.request.content);
      // Invalidate caches so new data shows immediately
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['notification-history'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) console.log('[Pro] Notification tapped:', response.notification.request.content);
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['notification-history'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
      // Navigate to admin notifications when user taps a notification
      try {
        router.push('/admin-notifications');
      } catch (e) { if (__DEV__) console.warn('Navigation failed', e); }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router, queryClient]);

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <OfflineBanner />
      {(status === 'update' || status === 'maintenance') && (
        <ForceUpdateModal status={status} storeUrl={storeUrl} />
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />
      <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.bg },
              animation: 'slide_from_right',
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="register" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
            <Stack.Screen name="verify-email" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="client-detail"
              options={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="scan-qr"
              options={{
                headerShown: false,
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="transaction-amount"
              options={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="dashboard" options={{ headerShown: false }} />
            <Stack.Screen name="security" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="team-management" options={{ headerShown: false }} />
            <Stack.Screen name="stores" options={{ headerShown: false }} />
            <Stack.Screen name="my-qr" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
            <Stack.Screen name="referral" options={{ headerShown: false }} />
            <Stack.Screen name="pending-gifts" options={{ headerShown: false }} />
            <Stack.Screen name="admin-notifications" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding"
              options={{ headerShown: false, animation: 'fade', gestureEnabled: false }}
            />
          </Stack>
        </NavThemeProvider>
      );
}
