import { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';
import i18n from '@/i18n';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { wp, hp, ms, radius } from '@/utils/responsive';

/**
 * Expo Router per-screen error boundary.
 * Export as `ErrorBoundary` from any route file to isolate crashes
 * within that screen — the parent layout (tab bar, stack) stays visible.
 */
export function ScreenErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  // The app theme can differ from the system one (forced light/dark in Profile).
  const theme = useTheme();
  const dangerTint = `${theme.danger}1F`;

  // Report per-screen crashes to Sentry (production only)
  useEffect(() => {
    if (!__DEV__) Sentry.captureException(error, { tags: { source: 'screen-error-boundary' } });
  }, [error]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={[styles.iconCircle, { backgroundColor: dangerTint }]}>
        <AlertTriangle size={32} color={theme.danger} strokeWidth={1.75} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{i18n.t('errors.somethingWentWrong')}</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{i18n.t('errors.unexpectedError')}</Text>
      {__DEV__ && error && (
        <Text style={[styles.devError, { backgroundColor: dangerTint, color: theme.danger }]} numberOfLines={4}>
          {error.message}
        </Text>
      )}
      <TouchableOpacity style={[styles.button, { backgroundColor: palette.violet }]} onPress={retry} activeOpacity={0.8} accessibilityRole="button">
        <RotateCcw size={18} color="#fff" strokeWidth={1.75} />
        <Text style={styles.buttonText}>{i18n.t('common.retry')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(32),
  },
  iconCircle: {
    width: ms(72),
    height: ms(72),
    borderRadius: ms(36),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(24),
  },
  title: {
    fontSize: ms(20),
    fontWeight: '600',
    marginBottom: hp(8),
    textAlign: 'center',
  },
  body: {
    fontSize: ms(14),
    textAlign: 'center',
    lineHeight: ms(22),
    marginBottom: hp(20),
  },
  devError: {
    fontSize: ms(11),
    fontFamily: 'monospace',
    padding: wp(12),
    borderRadius: radius.sm,
    marginBottom: hp(20),
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    paddingHorizontal: wp(28),
    paddingVertical: hp(14),
    minHeight: 48,
    borderRadius: radius.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: ms(16),
    fontWeight: '600',
  },
});
