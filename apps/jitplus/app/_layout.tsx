import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useNavigationContainerRef, useRouter, useSegments } from 'expo-router';
import { resetTo } from '@/utils/navReset';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
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
import * as Sentry from '@sentry/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useLaunchStore } from '@/stores/launchStore';
import { isProfileComplete } from '@/stores/authStore';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
import { useRealtimeEvents, useAppForegroundRefresh } from '@/hooks/useRealtimeEvents';
import { useNotificationListeners } from '@/hooks/useNotificationListeners';
import { getServerBaseUrl } from '@/services/api';
import { getToken } from '@/services/api/storage';
import { initSentry, navigationIntegration } from '@/services/sentry';
import { queryClient, CACHE_MAX_AGE } from '@/services/queryClient';
import { setupAndroidChannel } from '@/utils/notifications';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import ForceUpdateModal from '@/components/ForceUpdateModal';
import LaunchSplash from '@/components/launch/LaunchSplash';
import { takePendingClaim, takePendingStampCode } from '@/services/pendingClaim';
import { saveClientLanguage } from '@/services/clientLanguage';

initSentry();
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const theme = useTheme();
  const router = useRouter();
  const { client } = useAuth();
  const { status: forceUpdateStatus, storeUrl: forceUpdateStoreUrl, recheck: recheckForceUpdate } = useForceUpdate();
  const { locale } = useLanguage();

  // Screen-change breadcrumbs for Sentry (see services/sentry.ts).
  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    if (navigationRef) navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  // Redirect to the login screen whenever the user logs out (client becomes null).
  // - The whole history is replaced: signed-in screens must not come back with
  //   Back / swipe. This is the only logout redirect (screens no longer race it).
  // - Shared links stay open for people without an account: the deal / merchant
  //   screens have a guest view, claim and stamp-code keep the token for later.
  const segments = useSegments();
  const firstSegment = segments[0] ?? '';
  const onPublicLink = PUBLIC_LINK_SEGMENTS.has(firstSegment);
  useEffect(() => {
    if (!client && !onPublicLink) {
      resetTo('/login');
    }
  }, [client, onPublicLink]);

  // After authentication, if a Quick-Add claim token or a parcel QR code was
  // stashed (because the user opened it while logged-out), route back to its
  // screen to confirm it. Only once sign-in is over: taken earlier, the token was
  // lost when complete-profile or goHomeAfterLogin replaced the screen it opened.
  // Pushed, not replaced: the deal / merchant page goHomeAfterLogin restored
  // (and its pending auto-join) stays underneath.
  const signInDone = isProfileComplete(client) && !SIGN_IN_SEGMENTS.has(firstSegment);
  useEffect(() => {
    if (!signInDone) return;
    takePendingClaim().then(async (pending) => {
      if (pending) {
        router.push({ pathname: '/claim', params: { token: pending } });
        return;
      }
      // Same for a parcel QR code scanned while logged out.
      const stampCode = await takePendingStampCode();
      if (stampCode) router.push({ pathname: '/stamp-code', params: { token: stampCode } });
    }).catch(() => {});
  }, [client?.id, signInDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local language preference to backend once when client is authenticated
  useEffect(() => {
    if (client && locale && client.language !== locale) {
      saveClientLanguage(locale).catch((e) => { if (__DEV__) console.warn('Failed to sync language', e); });
    }
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time WebSocket connection ────────────────────────
  const socket = useRealtimeSocket({
    serverUrl: getServerBaseUrl(),
    // Memory-first (no keychain read on every reconnect attempt), web-safe.
    getToken: () => getToken().catch(() => null),
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
          {/* No swipe-back from the tabs: they are the root of the signed-in app (login and
              goHomeAfterLogin dismiss the sign-in screens), a swipe must never pop them. */}
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
          <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="verify-otp" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="complete-profile" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="set-password" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="change-password" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="legal" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="scratch/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="scratch/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="collections/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="coupons/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="coupons/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="deal/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="deal-alerts" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="book/[merchantId]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="bookings/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="bookings/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
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
  const markLaunchDone = useLaunchStore((s) => s.setDone);
  const finishLaunch = useCallback(() => { setLaunchDone(true); markLaunchDone(); }, [markLaunchDone]);

  return (
    <>
      {!authLoading && children}
      {!launchDone && <LaunchSplash ready={!authLoading} onFinish={finishLaunch} />}
    </>
  );
}

/** Screens of the sign-in / sign-up journey, all left through goHomeAfterLogin. */
const SIGN_IN_SEGMENTS = new Set(['login', 'register', 'verify-otp', 'set-password', 'complete-profile']);

/** Screens opened by shared links that a visitor without an account may see. */
const PUBLIC_LINK_SEGMENTS = new Set(['login', 'register', 'verify-otp', 'set-password', 'legal', 'merchant', 'deal', 'claim', 'stamp-code', '+not-found']);

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
          // A new app version may read the cached data differently: start clean.
          buster: Constants.expoConfig?.version ?? '',
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
