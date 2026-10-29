import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { EXPECTED_AUTH_ERROR_RE, scrubSentryEvent } from '@/utils/piiScrub';

const SENTRY_OPT_OUT_KEY = 'sentry_opt_out';

// GDPR / CNDP opt-out (Loi 09-08 art. 9): users may object to any processing.
// Events wait for the stored choice, so nothing leaks before it is read.
let optOut: Promise<boolean> = Promise.resolve(false);
let started = false;

function readOptOut(): Promise<boolean> {
  return AsyncStorage.getItem(SENTRY_OPT_OUT_KEY).then((v) => v === 'true').catch(() => false);
}

function startSentry(): void {
  // An unresolved EAS secret (literal "$...") or an empty string makes the
  // native SDK crash on Android.
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
  const enabled = !__DEV__ && !!dsn && dsn.startsWith('https://') && dsn.includes('.sentry.io');
  started = true;

  Sentry.init({
    dsn: enabled ? dsn : '',
    enabled,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version,
    dist: String(
      Platform.OS === 'ios'
        ? Constants.expoConfig?.ios?.buildNumber ?? '0'
        : Constants.expoConfig?.android?.versionCode ?? '0',
    ),
    tracesSampleRate: 0.02,
    maxBreadcrumbs: 10,
    attachScreenshot: false, // Screenshots can capture PII (names, cards, balances)
    attachViewHierarchy: false,
    ignoreErrors: ['No refresh token', 'Session expired', 'Network Error', 'ECONNABORTED'],
    beforeSend: async (event) => ((await optOut) ? null : scrubSentryEvent(event)),
    beforeSendTransaction: async (event) => ((await optOut) ? null : event),
  });
}

function stopSentry(): void {
  started = false;
  // close() also stops the native SDK, which never sees the JS beforeSend.
  Sentry.close().catch(() => { /* ignore */ });
}

export function isCrashReportingEnabled(): Promise<boolean> {
  return optOut.then((v) => !v);
}

export async function setCrashReportingEnabled(enabled: boolean): Promise<void> {
  optOut = Promise.resolve(!enabled);
  if (enabled && !started) startSentry();
  else if (!enabled && started) stopSentry();
  await AsyncStorage.setItem(SENTRY_OPT_OUT_KEY, enabled ? 'false' : 'true');
}

/**
 * Crash reporting setup, run once at app start.
 *
 * SECURITY: the DSN is bundled in the client. Configure inbound data filters in
 * Sentry project settings to reject invalid releases and apply rate limits.
 */
export function initSentry(): void {
  const initial = readOptOut();
  optOut = initial;
  startSentry();
  // Skipped if the user already changed the setting while the read was pending.
  initial.then((out) => { if (out && started && optOut === initial) stopSentry(); });

  // Reports fire-and-forget promises that have no .catch().
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as typeof globalThis & {
      onunhandledrejection?: (event: { reason?: unknown }) => void;
    };
    const originalHandler = g.onunhandledrejection;
    g.onunhandledrejection = (event: { reason?: unknown }) => {
      const error = event?.reason;
      if (!__DEV__ && error) {
        const msg = error instanceof Error ? error.message : '';
        if (!EXPECTED_AUTH_ERROR_RE.test(msg)) {
          Sentry.captureException(error, { tags: { source: 'unhandled-promise' } });
        }
      }
      if (originalHandler) originalHandler(event);
    };
  }

  // Warn in production, never crash the app.
  if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
    Sentry.captureMessage('EXPO_PUBLIC_API_URL is missing in production', 'error');
  }
}
