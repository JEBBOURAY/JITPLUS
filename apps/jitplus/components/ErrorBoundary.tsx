import React from 'react';
import SharedErrorBoundary from '@jitplus/shared/src/ErrorBoundary';
import * as Sentry from '@sentry/react-native';
import i18n from '@/i18n';

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

/**
 * App-wide error boundary — delegates to shared component with i18n labels.
 */
export default function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <SharedErrorBoundary
      labels={{
        title: i18n.t('errors.somethingWentWrong'),
        body: i18n.t('errors.unexpectedError'),
        retry: i18n.t('common.retry'),
      }}
      onError={(error, extra) => {
        const scrubbedExtra = scrubPii(extra) as Record<string, unknown> | undefined;
        Sentry.captureException(error, { extra: scrubbedExtra });
      }}
    >
      {children}
    </SharedErrorBoundary>
  );
}
