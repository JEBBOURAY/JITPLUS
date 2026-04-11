import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold } from '@expo-google-fonts/lexend';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Platform, View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryCache, MutationCache, onlineManager, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister } from '@/utils/queryPersister';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { getServerBaseUrl } from '@/services/api';
import { logError, logWarn, logInfo } from '@/utils/devLogger';

// ── Lazy-load Sentry to prevent native module crash on Android ──
// The native @sentry/react-native module can crash during require() if the DSN
// is missing or the native SDK is misconfigured. Lazy-loading ensures the app
// still boots even if Sentry fails entirely.
let Sentry: typeof import('@sentry/react-native') | null = null;
try {
  Sentry = require('@sentry/react-native');
} catch (e) {
  logWarn('Sentry', 'Native module failed to load:', e);
}
// Safe no-op wrappers so callers never need null-checks
const captureException: typeof import('@sentry/react-native').captureException =
  (...args) => { try { Sentry?.captureException?.(...args); } catch {} return ''; };

// SECURITY: Reduced from 24h to 4h to limit data exposure window if device is
// seized/rooted. AsyncStorage is unencrypted — shorter TTL = less recoverable data.
const CACHE_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours

// Sync React Query's online state with NetInfo — pauses mutations offline
// and auto-replays them on reconnect.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      logError('ReactQuery', `Query failed [${String(query.queryKey)}]`, error);
      if (!__DEV__) captureException(error, { tags: { source: 'react-query' } });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      logError('Mutation', `Mutation failed [${String(mutation.options.mutationKey ?? 'anonymous')}]`, error);
      if (!__DEV__) captureException(error, { tags: { source: 'react-query-mutation' } });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      staleTime: 2 * 60 * 1000,
      // Must be >= persister maxAge so in-memory cache isn't GC'd
      // before the persister considers it valid.
      gcTime: CACHE_MAX_AGE,
      refetchOnReconnect: 'always',
    },
  },
});

// ── Sentry init (crash reporting) ──────────────────────────────
// SECURITY: DSN is bundled in the client. Configure inbound data filters in
// Sentry project settings to reject invalid releases and apply rate limits.
// Validate DSN format before init — an unresolved EAS secret (literal "$...") or
// empty string would make the native SDK crash on Android.
const _sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN_PRO ?? '';
const _sentryEnabled =
  !__DEV__ &&
  !!_sentryDsn &&
  _sentryDsn.startsWith('https://') &&
  _sentryDsn.includes('.sentry.io');
try {
  Sentry?.init({
    dsn: _sentryEnabled ? _sentryDsn : '',
    enabled: _sentryEnabled,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version,
    dist: String(
      Platform.OS === 'ios'
        ? Constants.expoConfig?.ios?.buildNumber ?? '0'
        : Constants.expoConfig?.android?.versionCode ?? '0'
    ),
    tracesSampleRate: 0.2,
    maxBreadcrumbs: 50,
    attachScreenshot: false, // Disabled: screenshots can capture PII (names, cards, balances)
    attachViewHierarchy: false, // Disabled: view hierarchy can leak PII
  });
} catch (e) {
  // Sentry init can crash if native module is misconfigured — never block app launch
  logWarn('Sentry', 'init failed:', e);
}
// ── End Sentry init ────────────────────────────────

// ── Global unhandled promise rejection handler ──────────────────
// Catches fire-and-forget .then() without .catch() and logs to Sentry.
if (typeof globalThis !== 'undefined') {
  const originalHandler = (globalThis as any).onunhandledrejection;
  (globalThis as any).onunhandledrejection = (event: any) => {
    const error = event?.reason;
    if (!__DEV__ && error) {
      try { captureException(error, { tags: { source: 'unhandled-promise' } }); } catch {}
    }
    if (originalHandler) originalHandler(event);
  };
}

// ── Env validation (warn in production — never crash the app) ───
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  captureException(new Error('EXPO_PUBLIC_API_URL is missing in production'));
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
import ReferralPopup from '@/components/ReferralPopup';
import { useReferral } from '@/hooks/useQueryHooks';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    if (error) {
      // In production, report but don't throw — the app can render with system fonts
      if (__DEV__) throw error;
      captureException(error, { tags: { source: 'font-loading' } });
    }
  }, [error]);

  // Font loading timeout — don't block app launch forever if fonts fail
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontTimeout(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!loaded && !fontTimeout && !error) {
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
          maxAge: CACHE_MAX_AGE,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.state.status === 'success' &&
              // Whitelist approach: only persist known-safe cache keys.
              // Unknown keys are NOT persisted — safer than a blacklist.
              [
                'stores', 'rewards', 'plan', 'referral',
                'dashboard-stats', 'dashboard-trends',
                'transactions', 'clients',
                'notification-history', 'admin-notifications',
                'admin-notif-unread-count', 'whatsapp-quota', 'email-quota',
                'pending-gifts', 'team-members',
              ].includes(String(query.queryKey[0] ?? '').toLowerCase()),
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
  const { merchant, isTeamMember } = useAuth();
  const { status, storeUrl } = useForceUpdate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notificationListener = useRef<{ remove(): void } | null>(null);
  const responseListener = useRef<{ remove(): void } | null>(null);

  // ── Referral popup (global — above all screens) ──
  const { data: referralData } = useReferral(!isTeamMember && !!merchant);
  const referralCode = referralData?.referralCode ?? null;
  const [showReferral, setShowReferral] = useState(false);
  const referralTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!merchant || isTeamMember) return;
    let cancelled = false;

    (async () => {
      try {
        const ts = await AsyncStorage.getItem('@jitpluspro_referral_popup_ts');
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        if (ts && Date.now() - Number(ts) < threeDays) return;
        referralTimer.current = setTimeout(() => {
          if (!cancelled) setShowReferral(true);
        }, 4000);
      } catch {}
    })();

    return () => {
      cancelled = true;
      if (referralTimer.current) clearTimeout(referralTimer.current);
    };
  }, [merchant, isTeamMember]);

  const dismissReferral = useCallback(() => {
    setShowReferral(false);
    AsyncStorage.setItem('@jitpluspro_referral_popup_ts', String(Date.now())).catch(() => {});
  }, []);

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
      logInfo('Notifications', 'Notification received:', notification.request.content);
      // Only invalidate notification-related caches — dashboard-stats is not
      // affected by push notifications and caused unnecessary request bursts.
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      logInfo('Notifications', 'Notification tapped:', response.notification.request.content);
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
      // Navigate to admin notifications when user taps a notification
      try {
        router.push('/admin-notifications');
      } catch (e) { logWarn('Notifications', 'Navigation failed', e); }
    });

    // Handle cold-start: app was killed, user tapped a notification to launch it
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        logInfo('Notifications', 'Cold-start notification:', response.notification.request.content);
        queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
        queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
        try {
          router.push('/admin-notifications');
        } catch (e) { logWarn('Notifications', 'Cold-start navigation failed', e); }
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router, queryClient]);

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
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
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="dashboard" options={{ headerShown: false }} />
            <Stack.Screen name="security" options={{ headerShown: false }} />
            <Stack.Screen name="team-management" options={{ headerShown: false }} />
            <Stack.Screen name="stores" options={{ headerShown: false }} />
            <Stack.Screen name="referral" options={{ headerShown: false }} />
            <Stack.Screen name="admin-notifications" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding"
              options={{ headerShown: false, animation: 'fade', gestureEnabled: false }}
            />
          </Stack>
      <ReferralPopup visible={showReferral} onClose={dismissReferral} referralCode={referralCode} />
      </View>
        </NavThemeProvider>
      );
}
