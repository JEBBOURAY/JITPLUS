import React from 'react';
import SharedErrorBoundary from '@jitplus/shared/src/ErrorBoundary';
import * as Sentry from '@sentry/react-native';
import i18n from '@/i18n';

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
      onError={(error, extra) => Sentry.captureException(error, { extra })}
    >
      {children}
    </SharedErrorBoundary>
  );
}
