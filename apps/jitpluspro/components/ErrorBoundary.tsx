import React from 'react';
import SharedErrorBoundaryClass from '@jitplus/shared/src/ErrorBoundary';
import i18n from '@/i18n';
import { logError } from '@/utils/devLogger';

let Sentry: typeof import('@sentry/react-native') | null = null;
try { Sentry = require('@sentry/react-native'); } catch {}

// ── PII scrubber for Sentry ────────────────────────────────────────
const PII_KEYS = /email|phone|tel|password|token|secret|api_?key|auth|credit|card|ssn|birth|address/i;
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // emails
  /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g, // phone numbers
];

function scrubPii(obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    let result = obj;
    for (const pattern of PII_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => scrubPii(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (PII_KEYS.test(key)) {
        scrubbed[key] = '[REDACTED]';
      } else {
        scrubbed[key] = scrubPii(value, depth + 1);
      }
    }
    return scrubbed;
  }
  return obj;
}

// Type assertion needed: shared package may resolve a different @types/react version
// than the app, causing class component compatibility errors.
const SharedErrorBoundary = SharedErrorBoundaryClass as unknown as React.ComponentType<{
  labels?: { title: string; body: string; retry: string };
  onError?: (error: Error, extra?: Record<string, unknown>) => void;
  children: React.ReactNode;
}>;

/**
 * App-wide error boundary — delegates to shared component with i18n labels + Sentry.
 */
export default function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <SharedErrorBoundary
      labels={{
        title: i18n.t('errors.somethingWentWrong') ?? 'Une erreur est survenue',
        body: i18n.t('errors.unexpectedError') ?? "L'application a rencontré un problème inattendu.\nVeuillez réessayer.",
        retry: i18n.t('common.retry') ?? 'Réessayer',
      }}
      onError={(error, extra) => {
        logError('ErrorBoundary', 'Uncaught render error', error, extra as Record<string, unknown>);
        // Scrub PII before sending to Sentry
        const scrubbedExtra = scrubPii(extra) as Record<string, unknown> | undefined;
        try { Sentry?.captureException(error, { extra: scrubbedExtra }); } catch {}
      }}
    >
      {children}
    </SharedErrorBoundary>
  );
}
