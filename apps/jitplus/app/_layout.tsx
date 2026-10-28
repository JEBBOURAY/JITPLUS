import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from 'expo-router/react-navigation';
// Per-weight subpaths: the package root require()s every weight (17 TTF files
// bundled for the 8 used).
import { Lexend_400Regular } from '@expo-google-fonts/lexend/400Regular';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import { Lexend_600SemiBold } from '@expo-google-fonts/lexend/600SemiBold';
import { Lexend_700Bold } from '@expo-google-fonts/lexend/700Bold';
import { Cairo_400Regular } from '@expo-google-fonts/cairo/400Regular';
import { Cairo_500Medium } from '@expo-google-fonts/cairo/500Medium';
import { Cairo_600SemiBold } from '@expo-google-fonts/cairo/600SemiBold';
import { Cairo_700Bold } from '@expo-google-fonts/cairo/700Bold';
import * as SplashScreen from 'expo-splash-screen';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister, shouldPersistQuery } from '@/utils/queryPersister';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
import { useRealtimeEvents, useAppForegroundRefresh } from '@/hooks/useRealtimeEvents';
import { useNotificationListeners } from '@/hooks/useNotificationListeners';
import { api, getServerBaseUrl } from '@/services/api';
import { initSentry } from '@/services/sentry';
import { queryClient, CACHE_MAX_AGE } from '@/services/queryClient';
import { setupAndroidChannel } from '@/utils/notifications';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import ForceUpdateModal from '@/components/ForceUpdateModal';
import LaunchSplash from '@/components/launch/LaunchSplash';
import { takePendingClaim } from '@/services/pendingClaim';

initSentry();
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const theme = useTheme();
  const router = useRouter();
  const { client, isGuest } = useAuth();
  const { status: forceUpdateStatus, storeUrl: forceUpdateStoreUrl, recheck: recheckForceUpdate } = useForceUpdate();
  const { locale } = useLanguage();

  // Redirect to welcome screen whenever the user logs out (client becomes null).
  // Guests keep browsing: they reach auth-only screens through GuestGuard.
  useEffect(() => {
    if (!client && !isGuest) {
      router.replace('/welcome');
    }
  }, [client, isGuest, router]);

  // After authentication, if a Quick-Add claim token was stashed (because the
  // user landed on /claim while logged-out), route back to /claim to confirm it.
  useEffect(() => {
    if (!client) return;
    takePendingClaim().then((pending) => {
      if (pending) router.replace({ pathname: '/claim', params: { token: pending } });
    }).catch(() => {});
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local language preference to backend once when client is authenticated
  useEffect(() => {
    if (client && locale && client.language !== locale) {
      api.updateProfile({ language: locale }).catch((e) => { if (__DEV__) console.warn('Failed to sync language', e); });
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

  // Incoming links (claim, merchant share) are routed by app/+native-intent.tsx.
  useNotificationListeners();
  const isDark = theme.mode === 'dark';

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
      <OfflineBanner />
      {(forceUpdateStatus === 'update' || forceUpdateStatus === 'maintenance') && (
        <ForceUpdateModal status={forceUpdateStatus} storeUrl={forceUpdateStoreUrl} onRetry={recheckForceUpdate} />
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
          <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="referral" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="legal" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="scratch/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="scratch/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="coupons/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="coupons/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="deal/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="deal-alerts" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </ErrorBoundary>
      </View>
    </NavThemeProvider>
  );
}

/**
 * Plays the launch animation over the app (it takes over from the native
 * splash, which it hides) and mounts the app once the session is restored.
 * Fonts are already guaranteed loaded by the parent guard.
 */
function SplashGate({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading } = useAuth();
  const [launchDone, setLaunchDone] = useState(false);
  const finishLaunch = useCallback(() => setLaunchDone(true), []);

  return (
    <>
      {!authLoading && children}
      {!launchDone && <LaunchSplash ready={!authLoading} onFinish={finishLaunch} />}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
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

  // Don't render anything until fonts are loaded — LaunchSplash handles hideAsync
  if (!loaded && !fontTimeout && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          maxAge: CACHE_MAX_AGE,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersistQuery,
            // Never persist mutations: their mutationFn cannot be serialized,
            // so resuming them on next launch throws "No mutationFn found"
            // (Sentry JITPLUS-MOBILE-6, source: react-query-mutation).
            shouldDehydrateMutation: () => false,
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
      </ErrorBoundary>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
