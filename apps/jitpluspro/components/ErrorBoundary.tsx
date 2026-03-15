import React from 'react';
import SharedErrorBoundary from '@jitplus/shared/src/ErrorBoundary';
import * as Sentry from '@sentry/react-native';
import i18n from '@/i18n';

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
      onError={(error, extra) => Sentry.captureException(error, { extra })}
    >
      {children}
    </SharedErrorBoundary>
  );
}
