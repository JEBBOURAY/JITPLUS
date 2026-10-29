import { logWarn } from '@/utils/devLogger';

type SentryModule = typeof import('@sentry/react-native');

// Loaded with require() inside try/catch: the native module can throw at import
// time when the DSN or the native SDK is misconfigured, and the app must still boot.
let Sentry: SentryModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Sentry = require('@sentry/react-native');
} catch (e) {
  logWarn('Sentry', 'Native module failed to load:', e);
}

export { Sentry };

/** Safe wrapper: a no-op when Sentry failed to load, and never throws. */
export const captureException: SentryModule['captureException'] = (...args) => {
  try { Sentry?.captureException?.(...args); } catch {}
  return '';
};
