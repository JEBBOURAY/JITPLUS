import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';
import i18n from '@/i18n';
import { wp, hp, ms } from '@/utils/responsive';

const darkColors = {
  bg: '#1A1A2E', iconBg: '#3B1C1C', title: '#F3F4F6', body: '#9CA3AF',
  devBg: '#3B1C1C', brand: '#7C3AED', danger: '#EF4444',
};
const lightColors = {
  bg: '#FAFAFA', iconBg: '#FEE2E2', title: '#111827', body: '#6B7280',
  devBg: '#FEE2E2', brand: '#7C3AED', danger: '#EF4444',
};

/**
 * Expo Router per-screen error boundary.
 * Export as `ErrorBoundary` from any route file to isolate crashes
 * within that screen — the parent layout (tab bar, stack) stays visible.
 */
export function ScreenErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? darkColors : lightColors;

  // Report per-screen crashes to Sentry (production only)
  useEffect(() => {
    if (!__DEV__) Sentry.captureException(error, { tags: { source: 'screen-error-boundary' } });
  }, [error]);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]} accessibilityRole="alert">
      <View style={[styles.iconCircle, { backgroundColor: c.iconBg }]}>
        <AlertTriangle size={36} color={c.danger} strokeWidth={1.5} />
      </View>
      <Text style={[styles.title, { color: c.title }]}>{i18n.t('errors.somethingWentWrong')}</Text>
      <Text style={[styles.body, { color: c.body }]}>{i18n.t('errors.unexpectedError')}</Text>
      {__DEV__ && error && (
        <Text style={[styles.devError, { backgroundColor: c.devBg, color: c.danger }]} numberOfLines={4}>
          {error.message}
        </Text>
      )}
      <TouchableOpacity style={[styles.button, { backgroundColor: c.brand }]} onPress={retry} activeOpacity={0.8}>
        <RotateCcw size={18} color="#fff" strokeWidth={1.5} />
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
    width: ms(80),
    height: ms(80),
    borderRadius: ms(40),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(24),
  },
  title: {
    fontSize: ms(20),
    fontWeight: '700',
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
    borderRadius: ms(8),
    marginBottom: hp(20),
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    paddingHorizontal: wp(28),
    paddingVertical: hp(14),
    borderRadius: ms(14),
  },
  buttonText: {
    color: '#fff',
    fontSize: ms(16),
    fontWeight: '700',
  },
});
