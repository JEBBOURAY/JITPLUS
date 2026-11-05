import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
import { Text } from '@/components/AppText';
import StarLoader from '@/components/StarLoader';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, Clock, Package } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import type { StampCodeRedeemResult } from '@/services/api/stamp-codes';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/useQueryHooks';
import { clearPendingStampCode, savePendingStampCode } from '@/services/pendingClaim';
import { isStampCodeToken } from '@/utils/ids';
import { pluralKey } from '@jitplus/shared';

type ErrorKey = 'errorInvalid' | 'errorUsed' | 'errorRevoked' | 'errorMerchantFull' | 'errorLimit' | 'errorNetwork' | 'errorRetry';

/** Failures after which the code is still usable: the screen offers to try again. */
const RETRYABLE: ReadonlySet<ErrorKey> = new Set(['errorNetwork', 'errorRetry']);

type Screen =
  | { kind: 'loading' }
  | { kind: 'login-required' }
  | { kind: 'confirm' }
  | { kind: 'success'; result: StampCodeRedeemResult }
  | { kind: 'error'; messageKey: ErrorKey };

/** Maps the backend error (its `code`, then the HTTP status) to a message key. */
function errorKeyOf(err: unknown): ErrorKey {
  const response = (err as { response?: { status?: number; data?: { code?: string } } })?.response;
  if (!response) return 'errorNetwork';
  switch (response.data?.code) {
    case 'STAMP_CODE_USED': return 'errorUsed';
    case 'STAMP_CODE_REVOKED': return 'errorRevoked';
    case 'MERCHANT_CLIENT_LIMIT': return 'errorMerchantFull';
    case 'ACCUMULATION_LIMIT': return 'errorLimit';
  }
  // Rate limit, uncoded conflict (database race) or server error: the code was not consumed.
  const status = response.status ?? 0;
  if (status === 429 || status === 409 || status >= 500) return 'errorRetry';
  return 'errorInvalid';
}

/**
 * E-commerce parcel QR code: the client scanned the code slipped into their
 * order with the phone camera. Same flow as the Quick-Add claim screen:
 * stash the token while logged out, then ask before crediting the account
 * logged in now (a shared phone may be on someone else's account).
 */
export default function StampCodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const client = useAuthStore((s) => s.client);
  const params = useLocalSearchParams<{ token?: string }>();
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  const token = typeof params.token === 'string' ? params.token : '';
  const tokenValid = isStampCodeToken(token);
  // Guards against a second redeem call for the same token (store re-emits).
  const redeemedRef = useRef<string | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => screen.kind === 'loading');
    return () => sub.remove();
  }, [screen.kind]);

  const redeem = useCallback(async () => {
    if (!tokenValid) {
      setScreen({ kind: 'error', messageKey: 'errorInvalid' });
      return;
    }
    if (redeemedRef.current === token) return;
    redeemedRef.current = token;
    setScreen({ kind: 'loading' });
    try {
      const result = await api.redeemStampCode(token);
      queryClient.invalidateQueries({ queryKey: queryKeys.stamps });
      setScreen({ kind: 'success', result });
    } catch (err: unknown) {
      const messageKey = errorKeyOf(err);
      setScreen({ kind: 'error', messageKey });
      if (RETRYABLE.has(messageKey)) redeemedRef.current = null;
    }
  }, [token, tokenValid, queryClient]);

  useEffect(() => {
    if (!tokenValid) {
      setScreen({ kind: 'error', messageKey: 'errorInvalid' });
      return;
    }
    if (!client) {
      (async () => {
        await savePendingStampCode(token);
        setScreen({ kind: 'login-required' });
      })();
      return;
    }
    void clearPendingStampCode();
    if (redeemedRef.current !== token) setScreen({ kind: 'confirm' });
    // Depend on client?.id (not the whole object) so unrelated store mutations
    // don't reset the screen.
  }, [client?.id, token, tokenValid]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountName = client
    ? `${client.prenom ?? ''} ${client.nom ?? ''}`.trim() || t('qr.client')
    : '';

  const goHome = useCallback(() => router.replace('/(tabs)'), [router]);
  const goToLogin = useCallback(() => router.replace('/welcome'), [router]);
  const goToMerchant = useCallback((id: string) => {
    router.replace({ pathname: '/merchant/[id]', params: { id } });
  }, [router]);

  const renderBody = () => {
    switch (screen.kind) {
      case 'loading':
        return (
          <>
            <StarLoader />
            <Text style={[styles.body, { color: theme.textMuted }]}>{t('stampCode.loading')}</Text>
          </>
        );
      case 'login-required':
        return (
          <>
            <Clock size={56} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>{t('stampCode.loginPromptTitle')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{t('stampCode.loginPromptBody')}</Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={goToLogin}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{t('stampCode.loginPromptCta')}</Text>
            </TouchableOpacity>
          </>
        );
      case 'confirm':
        return (
          <>
            <Package size={56} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>{t('stampCode.confirmTitle')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              {t('stampCode.confirmBody', { name: accountName })}
            </Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={() => { void redeem(); }}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{t('stampCode.confirmCta')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={goHome} accessibilityRole="button">
              <Text style={[styles.btnSecondaryText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </>
        );
      case 'success': {
        const { result } = screen;
        return (
          <>
            <CheckCircle2 size={64} color={theme.success} />
            <Text style={[styles.title, { color: theme.text }]}>
              {result.alreadyRedeemed ? t('stampCode.alreadyTitle') : t(pluralKey('stampCode.successTitle', result.stamps, locale), { count: result.stamps })}
            </Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              {t('stampCode.successBody', { merchant: result.merchant.nom, balance: result.newBalance })}
            </Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={() => goToMerchant(result.merchant.id)}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{t('stampCode.successCta')}</Text>
            </TouchableOpacity>
          </>
        );
      }
      case 'error': {
        const canRetry = RETRYABLE.has(screen.messageKey);
        return (
          <>
            <AlertCircle size={56} color={theme.danger} />
            <Text style={[styles.title, { color: theme.text }]}>{t('stampCode.title')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{t(`stampCode.${screen.messageKey}`)}</Text>
            {canRetry && (
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
                onPress={() => { void redeem(); }}
                accessibilityRole="button"
              >
                <Text style={styles.btnPrimaryText}>{t('stampCode.retry')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={canRetry ? styles.btnSecondary : [styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={goHome}
              accessibilityRole="button"
            >
              <Text style={canRetry ? [styles.btnSecondaryText, { color: theme.textMuted }] : styles.btnPrimaryText}>
                {t('common.close')}
              </Text>
            </TouchableOpacity>
          </>
        );
      }
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.inner}>{renderBody()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  btnPrimary: {
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 200,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnSecondary: { paddingHorizontal: 28, paddingVertical: 10 },
  btnSecondaryText: { fontWeight: '600', fontSize: 15 },
});
