import React from 'react';
import SharedErrorBoundaryClass from '@jitplus/shared/src/ErrorBoundary';
import i18n from '@/i18n';
import { logError } from '@/utils/devLogger';

let Sentry: typeof import('@sentry/react-native') | null = null;
try { Sentry = require('@sentry/react-native'); } catch {}

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
        try { Sentry?.captureException(error, { extra }); } catch {}
      }}
    >
      {children}
    </SharedErrorBoundary>
  );
}
