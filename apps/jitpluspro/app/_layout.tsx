import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold } from '@expo-google-fonts/lexend';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Platform, View, InteractionManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryCache, MutationCache, onlineManager, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister } from '@/utils/queryPersister';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useRealtimeSocket } from '@jitplus/shared/src/useRealtimeSocket';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { useAppForegroundRefresh } from '@/hooks/useAppForegroundRefresh';
import api, { getServerBaseUrl } from '@/services/api';
import { logError, logWarn, logInfo } from '@/utils/devLogger';

// ── GDPR opt-out (honours SENTRY_OPT_OUT AsyncStorage flag) ─────
// Sentry is configured as PII-free anonymous crash reporting (legitimate
// interest under GDPR), but we still expose a way for users to opt out.
// If the flag is set, we close the Sentry client so no events are sent.
import AsyncStorageForConsent from '@react-native-async-storage/async-storage';

// RTL/LTR direction is applied live via the `direction` style prop
// in ThemedNavigator. I18nManager.forceRTL() persists the setting for
// cold starts. No restart alert is needed.

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { Notifications, isExpoGo, setupAndroidChannels } from '@/utils/notifications';
import AppErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import ForceUpdateModal from '@/components/ForceUpdateModal';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendMerchantPushToken } from '@/services/merchantPushToken';
import MetaAdsManager from '@/services/metaAdsManager';
import SplashAnimated from '@/components/SplashAnimated';

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

// ── Persist options (module-level to avoid re-creating on every render) ─────
// Keep the persisted surface SMALL — large lists (transactions, clients,
// notification history) used to bloat the payload to several MB and block the
// JS thread 500ms–2s on cold-start / OS kill during rehydration. SWR refetches
// them quickly anyway. The `buster` invalidates the on-disk cache when the
// app version changes (e.g. after a schema change).
const PERSISTED_KEYS = new Set([
  'plan', 'referral', 'stores', 'rewards',
  'dashboard-kpis',
]);
const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: CACHE_MAX_AGE,
  buster: Constants.expoConfig?.version ?? 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { status: string }; queryKey: readonly unknown[] }) =>
      query.state.status === 'success' &&
      PERSISTED_KEYS.has(String(query.queryKey[0] ?? '').toLowerCase()),
  },
};

// Skip expected HTTP 4xx errors (business/validation failures) from Sentry.
// Only report 5xx, network errors, and non-HTTP errors.
function isServerOrNetworkError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return !status || status >= 500;
}

let hasHandledColdStart = false;

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      logError('ReactQuery', `Query failed [${String(query.queryKey)}]`, error);
      if (!__DEV__ && isServerOrNetworkError(error)) {
        captureException(error, { tags: { source: 'react-query' } });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      logError('Mutation', `Mutation failed [${String(mutation.options.mutationKey ?? 'anonymous')}]`, error);
      if (!__DEV__ && isServerOrNetworkError(error)) {
        captureException(error, { tags: { source: 'react-query-mutation' } });
      }
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
      refetchOnReconnect: true,
      // Disabled to prevent a "refetch storm" on app resume — 15 persisted
      // queries firing in parallel was blocking the JS thread for several
      // seconds. A targeted post-resume refresh is done by
      // useAppForegroundRefresh (admin-notif badge + transactions only).
      refetchOnWindowFocus: false,
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
    tracesSampleRate: 0.05,
    maxBreadcrumbs: 30,
    // Disabled to reduce JNI global-ref pressure on Android (AddGlobalRef abort)
    enableAutoPerformanceTracing: false,
    enableNativeFramesTracking: false,
    enableAppStartTracking: false,
    enableUserInteractionTracing: false,
    enableStallTracking: false,
    attachScreenshot: false, // Disabled: screenshots can capture PII (names, cards, balances)
    attachViewHierarchy: false, // Disabled: view hierarchy can leak PII
    ignoreErrors: [
      'No refresh token',
      'No refresh credentials',
      'Session expired',
      'Network Error',
      'ECONNABORTED',
    ],
    beforeSend(event) {
      const msg = event.exception?.values?.[0]?.value ?? '';
      if (/No refresh (token|credentials)|Session expired/i.test(msg)) return null;

      // ── PII scrubber (CNDP Loi 09-08 + App Store 5.1.1) ──
      // Strip emails, Moroccan phone numbers, bearer/JWT tokens from every field.
      const scrub = (s: string): string =>
        s
          .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
          .replace(/(\+?212|0)[\s-]?[5-7](?:[\s-]?\d){8}/g, '[phone]')
          .replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[token]');

      if (event.exception?.values) {
        for (const v of event.exception.values) {
          if (v.value) v.value = scrub(v.value);
        }
      }
      if (event.message) event.message = scrub(event.message);
      if (event.breadcrumbs) {
        for (const b of event.breadcrumbs) {
          if (typeof b.message === 'string') b.message = scrub(b.message);
          if (b.data) {
            for (const k of Object.keys(b.data)) {
              const val = (b.data as Record<string, unknown>)[k];
              if (typeof val === 'string') (b.data as Record<string, unknown>)[k] = scrub(val);
            }
          }
        }
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });
} catch (e) {
  // Sentry init can crash if native module is misconfigured — never block app launch
  logWarn('Sentry', 'init failed:', e);
}
AsyncStorageForConsent.getItem('sentry_opt_out')
  .then((v) => {
    if (v === 'true') {
      try { Sentry?.close?.(); } catch {}
    }
  })
  .catch(() => { /* ignore */ });
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
      if (!/No refresh (token|credentials)|Session expired/i.test(msg)) {
        try { captureException(error, { tags: { source: 'unhandled-promise' } }); } catch {}
      }
    }
    if (originalHandler) originalHandler(event);
  };
}

// ── Env validation (warn in production — never crash the app) ───
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  captureException(new Error('EXPO_PUBLIC_API_URL is missing in production'));
}

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

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      void MetaAdsManager.initialize();
    });
    return () => handle?.cancel?.();
  }, []);

  if (!loaded && !fontTimeout && !error) {
    return null;
  }

  return <RootLayoutNav />;
}

/**
 * SplashGate — shows the custom animated splash (SplashAnimated) until its
 * sequence finishes AND AuthProvider has resolved (whichever is later), then
 * reveals the real app. The native Expo splash is hidden by SplashAnimated
 * itself, right on its own mount — not before.
 */
function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const [showApp, setShowApp] = useState(false);

  if (!showApp) {
    return <SplashAnimated ready={!loading} onFinish={() => setShowApp(true)} />;
  }

  return <>{children}</>;
}

// Memoized to avoid the StatusBar native module being called on every parent
// re-render (logcat showed 102 "Ignored status bar change" warnings per 3 min).
const StatusBarMemo = React.memo(function StatusBarMemo({ isDark }: { isDark: boolean }) {
  return <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />;
});

function RootLayoutNav() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
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

// Public routes that don't require authentication
const PUBLIC_ROUTES = new Set(['login', 'register', 'verify-email', 'forgot-password', 'legal']);

function ThemedNavigator() {
  const theme = useTheme();
  const { isDark } = theme;
  const { merchant, isTeamMember, loading } = useAuth();
  const { status, storeUrl } = useForceUpdate();
  const router = useRouter();
  const segments = useSegments();
  const queryClient = useQueryClient();

  // Navigation theme aligned with OUR design tokens. The stock DefaultTheme /
  // DarkTheme use colors.background = rgb(242,242,242) / near-black, which do
  // NOT match theme.bg (#FFFFFF / #0B0F14). react-native-screens paints each
  // native screen with colors.background, so on a theme swap the mismatched
  // native background flashes (white when leaving dark mode). Matching it to
  // theme.bg removes the flash entirely.
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.bg,
        card: theme.bgCard ?? theme.bg,
        text: theme.text,
        border: theme.border,
        primary: theme.primary,
      },
    };
  }, [isDark, theme.bg, theme.bgCard, theme.text, theme.border, theme.primary]);

  // SECURITY: Redirect unauthenticated deep links to login.
  // Without this, a deep link to e.g. jitpluspro://security could
  // render a protected screen without auth.
  useEffect(() => {
    if (loading) return;
    const firstSegment = segments[0] ?? '';
    if (!merchant && !PUBLIC_ROUTES.has(firstSegment)) {
      router.replace('/login');
    }
  }, [loading, merchant, segments, router]);

  // Warm heavy native modules in background so the FIRST navigation that
  // needs them is instant. Cold-parse of expo-camera (~200ms) is otherwise
  // paid by the user the first time they tap "Scanner".
  const didPreloadRef = useRef(false);
  useEffect(() => {
    if (loading || !merchant || didPreloadRef.current) return;
    didPreloadRef.current = true;
    InteractionManager.runAfterInteractions(() => {
      try { require('expo-camera'); } catch {}
      try { require('expo-image-picker'); } catch {}
    });
  }, [loading, merchant]);
  const notificationListener = useRef<{ remove(): void } | null>(null);
  const responseListener = useRef<{ remove(): void } | null>(null);

  const hasMerchant = !!merchant;

  // ── Real-time WebSocket connection ────────────────────────
  const socket = useRealtimeSocket({
    serverUrl: getServerBaseUrl(),
    getToken: () => SecureStore.getItemAsync('accessToken'),
    enabled: !!merchant,
  });
  useRealtimeEvents(socket);
  useAppForegroundRefresh();

  // ── Android notification channels + FCM listeners ─────────
  useEffect(() => {
    setupAndroidChannels();
  }, []);

  useEffect(() => {
    if (!Notifications || isExpoGo) return;

    // Show notifications in foreground is handled by setNotificationHandler
    // in utils/notifications.ts. Here we listen for received + tapped events.

    // Listen for push token changes (FCM rotation) — re-register with backend.
    // We defer the work to runAfterInteractions because Android sometimes
    // delivers the token rotation event on resume, when the JS thread is
    // already busy with screen rendering.
    const tokenSub = Notifications.addPushTokenListener(() => {
      logInfo('Notifications', 'Push token rotated, re-registering');
      InteractionManager.runAfterInteractions(async () => {
        try {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
          if (projectId) {
            const expoTokenData = await Notifications!.getExpoPushTokenAsync({ projectId });
            const expoToken = String(expoTokenData.data);
            const lang = await AsyncStorage.getItem('jitpluspro_language');
            // Deduped — the helper drops duplicate / burst PATCHes that Android
            // FCM rotation can otherwise trigger in a tight loop.
            await sendMerchantPushToken(api, expoToken, lang || 'fr');
          }
        } catch (e) {
          logWarn('Notifications', 'Token refresh sync failed', e);
        }
      });
    });

    // Reset iOS badge when app is foregrounded
    Notifications.setBadgeCountAsync(0).catch(() => {});

    // SECURITY/PERF: Debounce notification-received invalidations — if 5 push
    // notifications arrive in quick succession, we batch into a single refetch
    // instead of firing 10 HTTP requests (2 per notification).
    let notifDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      logInfo('Notifications', 'Notification received:', notification.request.content);
      if (notifDebounceTimer) clearTimeout(notifDebounceTimer);
      notifDebounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
        queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
      }, 300);
    });

    // Route notification tap to the correct merchant-app screen.
    // The router runs identically for FCM (Android) and APNs (iOS) payloads,
    // ensuring uniform deep-link behaviour across both platforms.
    const navigateByPayload = (data?: Record<string, unknown>) => {
      try {
        const action = typeof data?.action === 'string' ? data.action : undefined;
        const event = typeof data?.event === 'string' ? data.event : undefined;

        // 1. Action-based deep links from scheduled campaigns / reminders
        if (action) {
          switch (action) {
            case 'open_referral':            router.push('/referral'); return;
            case 'open_settings':            router.push('/settings'); return;
            case 'open_security':            router.push('/security'); return;
            case 'open_logo':                router.push('/(tabs)/account'); return;
            case 'open_scan':                router.push('/(tabs)/scan'); return;
            case 'open_plan':                router.push('/plan'); return;
            case 'open_dashboard':           router.push('/(tabs)'); return;
            case 'open_clients':             router.push('/(tabs)/activity'); return;
            case 'open_messages':            router.push('/(tabs)/messages'); return;
            case 'open_notifications':      // alias used by some campaigns
            case 'open_admin_notifications': router.push('/admin-notifications'); return;
            default:
              logWarn('Notifications', 'Unknown FCM action:', action);
              break;
          }
        }

        // 2. Event-based fallback (admin broadcasts, future server-side events)
        switch (event) {
          case 'admin_broadcast':
            router.push('/admin-notifications');
            return;
        }

        // 3. Default: open the in-app admin notifications feed so the user
        // can still find the message — never the generic home tab.
        router.push('/admin-notifications');
      } catch (e) { logWarn('Notifications', 'Navigation failed', e); }
    };

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      logInfo('Notifications', 'Notification tapped:', response.notification.request.content);
      Notifications!.setBadgeCountAsync(0).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
      navigateByPayload(response.notification.request.content.data as Record<string, unknown> | undefined);
    });

    // Handle cold-start: app was killed, user tapped a notification to launch it
    if (!hasHandledColdStart) {
      hasHandledColdStart = true; // Mark handled immediately to prevent race conditions
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          logInfo('Notifications', 'Cold-start notification:', response.notification.request.content);
          queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
          queryClient.invalidateQueries({ queryKey: ['admin-notif-unread-count'] });
          
          // Add a small delay for Expo Router to be fully mounted on cold starts
          setTimeout(() => {
            navigateByPayload(response.notification.request.content.data as Record<string, unknown> | undefined);
          }, 500);
        }
      });
    }

    return () => {
      if (notifDebounceTimer) clearTimeout(notifDebounceTimer);
      tokenSub.remove();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router, queryClient]);

  return (
    <NavThemeProvider value={navTheme}>
      {/* backgroundColor MUST be set here: this persistent root View never
          remounts on theme change, so it covers the white native window
          background and prevents a white flash during the theme swap frame. */}
      <View style={{ flex: 1, direction: 'ltr', backgroundColor: theme.bg }}>
      <OfflineBanner />
      {(status === 'update' || status === 'maintenance') && (
        <ForceUpdateModal status={status} storeUrl={storeUrl} />
      )}
      <StatusBarMemo isDark={isDark} />
      <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.bg },
              animation: 'slide_from_right',
              gestureEnabled: true,
              // freezeOnBlur retiré : cause un crash "wrong thread" dans
              // react-native-screens@4.16 quand un écran gelé est retiré du Stack
              // (Screen.startRemovalTransition sur le thread mqt_v_js au lieu du main).
              // Conservé uniquement sur les Tabs où les écrans ne sont pas "removed".
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
            <Stack.Screen name="transactions" options={{ headerShown: false, animation: 'slide_from_right' }} />
          </Stack>
      </View>
        </NavThemeProvider>
      );
}
