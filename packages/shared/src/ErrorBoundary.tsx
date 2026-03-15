// ── Shared ErrorBoundary ────────────────────────────────────────────────────
// Renders a user-friendly fallback when a child component throws.
// Accepts i18n labels so both JitPlus and JitPlus Pro can supply their own strings.
import React, { Component, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';

/** Optional Sentry-like reporter — injected by each app so shared code stays dependency-free. */
export type ErrorReporter = (error: Error, extra?: Record<string, unknown>) => void;

export interface ErrorBoundaryLabels {
  title: string;
  body: string;
  retry: string;
}

const DEFAULT_LABELS: ErrorBoundaryLabels = {
  title: 'Une erreur est survenue',
  body: "L'application a rencontré un problème inattendu.\nVeuillez réessayer.",
  retry: 'Réessayer',
};

interface Props {
  children: React.ReactNode;
  labels?: ErrorBoundaryLabels;
  /** Called in production to report caught errors (e.g. Sentry.captureException). */
  onError?: ErrorReporter;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
    // Report to crash-reporting service in production
    this.props.onError?.(error, { componentStack: info.componentStack ?? '' });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const labels = this.props.labels ?? DEFAULT_LABELS;
      return (
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <AlertTriangle size={36} color="#EF4444" strokeWidth={2} />
          </View>
          <Text style={styles.title}>{labels.title}</Text>
          <Text style={styles.body}>{labels.body}</Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.devError} numberOfLines={6}>
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleRetry} activeOpacity={0.8}>
            <RotateCcw size={18} color="#fff" strokeWidth={2.5} />
            <Text style={styles.buttonText}>{labels.retry}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  devError: {
    fontSize: 11,
    color: '#EF4444',
    fontFamily: 'monospace',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
