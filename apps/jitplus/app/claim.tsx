import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, BackHandler } from 'react-native';
import { Text } from '@/components/AppText';
import StarLoader from '@/components/StarLoader';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, Clock, Ticket } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateScratchCards, usePendingScratchCards } from '@/hooks/useScratchHooks';
import { queryKeys } from '@/hooks/useQueryHooks';
import { clearPendingClaim, savePendingClaim } from '@/services/pendingClaim';
import { isClaimToken } from '@/utils/ids';

type ConsumeResult = { success: true; alreadyConsumed: boolean; mergedCards: number; pendingScratchCards?: number; merchant: { id: string; nom: string | null } };

type Screen =
  | { kind: 'loading' }
  | { kind: 'login-required' }
  | { kind: 'confirm' }
  | { kind: 'success'; result: ConsumeResult }
  | { kind: 'error'; messageKey: 'errorExpired' | 'errorInvalid' | 'errorAlreadyUsed' };

export default function ClaimScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();
  const client = useAuthStore((s) => s.client);
  const params = useLocalSearchParams<{ token?: string }>();
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  const token = typeof params.token === 'string' ? params.token : '';
  const tokenValid = isClaimToken(token);
  // Guards against duplicate consume calls. Without this, an unrelated client
  // reference change (e.g. Zustand store re-emit after a profile refetch) would
  // re-run the consume effect, hit the backend a second time and fall into the
  // "already used" branch — misleading the user.
  const consumedRef = useRef<string | null>(null);

  // Disable hardware back during consumption to avoid leaving mid-merge.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => screen.kind === 'loading');
    return () => sub.remove();
  }, [screen.kind]);

  const consume = useCallback(async () => {
    if (!tokenValid) {
      setScreen({ kind: 'error', messageKey: 'errorInvalid' });
      return;
    }
    if (consumedRef.current === token) return;
    consumedRef.current = token;
    setScreen({ kind: 'loading' });
    try {
      const result = await api.consumeClaim(token);
      // The merge moved cards and scratch cards onto this account; cached lists predate it.
      invalidateScratchCards(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.stamps });
      setScreen({ kind: 'success', result });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 410) setScreen({ kind: 'error', messageKey: 'errorExpired' });
      else if (status === 403) setScreen({ kind: 'error', messageKey: 'errorAlreadyUsed' });
      else setScreen({ kind: 'error', messageKey: 'errorInvalid' });
      // Allow a retry only on transient failures (not on the canonical
      // "already used" / "expired" terminal states).
      if (status !== 403 && status !== 410) consumedRef.current = null;
    }
  }, [token, tokenValid, queryClient]);

  // Stash the token if not authenticated; otherwise ask before merging. Any app
  // or web page can open jitplus://claim, and on a shared phone the account
  // logged in now may not be the one the link was sent to.
  useEffect(() => {
    if (!tokenValid) {
      setScreen({ kind: 'error', messageKey: 'errorInvalid' });
      return;
    }
    if (!client) {
      (async () => {
        await savePendingClaim(token);
        setScreen({ kind: 'login-required' });
      })();
      return;
    }
    // The token now lives in this screen's params: a declined or failed claim
    // must not reopen on the next login.
    void clearPendingClaim();
    if (consumedRef.current !== token) setScreen({ kind: 'confirm' });
    // Depend on client?.id (not the whole object) so unrelated store mutations
    // don't reset the screen.
  }, [client?.id, token, tokenValid]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountName = client
    ? `${client.prenom ?? ''} ${client.nom ?? ''}`.trim() || t('qr.client')
    : '';

  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  // After a successful merge, a scratch card may have been re-attributed to
  // the user (consumeClaim returns the count). Surface it with a CTA.
  const hasPendingScratch = screen.kind === 'success' && (screen.result.pendingScratchCards ?? 0) > 0;
  const pendingCards = usePendingScratchCards(hasPendingScratch);
  const firstPendingCardId = pendingCards.data?.[0]?.id;
  const scratchCtaBusy = hasPendingScratch && pendingCards.isFetching;
  const goToScratch = useCallback(() => {
    if (firstPendingCardId) {
      router.replace({ pathname: '/scratch/[id]', params: { id: firstPendingCardId } });
    } else {
      router.replace('/(tabs)');
    }
  }, [router, firstPendingCardId]);

  const goToLogin = useCallback(() => {
    router.replace('/welcome');
  }, [router]);

  // ── UI ──
  const renderBody = () => {
    switch (screen.kind) {
      case 'loading':
        return (
          <>
            <StarLoader />
            <Text style={[styles.body, { color: theme.textMuted }]}>{t('claim.loading')}</Text>
          </>
        );
      case 'login-required':
        return (
          <>
            <Clock size={56} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>{t('claim.loginPromptTitle')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{t('claim.loginPromptBody')}</Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={goToLogin}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{t('claim.loginPromptCta')}</Text>
            </TouchableOpacity>
          </>
        );
      case 'confirm':
        return (
          <>
            <Ticket size={56} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>{t('claim.confirmTitle')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              {t('claim.confirmBody', { name: accountName })}
            </Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={() => { void consume(); }}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{t('claim.confirmCta')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={goHome} accessibilityRole="button">
              <Text style={[styles.btnSecondaryText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </>
        );
      case 'success': {
        const merchantName = screen.result.merchant.nom ?? 'JitPlus';
        return (
          <>
            <CheckCircle2 size={64} color={theme.success} />
            <Text style={[styles.title, { color: theme.text }]}>{t('claim.successTitle')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              {t('claim.successBody', { merchant: merchantName })}
            </Text>
            {hasPendingScratch && (
              <View style={[styles.scratchNote, { borderColor: theme.primary }]}>
                <Ticket size={20} color={theme.primary} />
                <Text style={[styles.scratchNoteText, { color: theme.primary }]}>{t('scratch.claim.pending')}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }, scratchCtaBusy && { opacity: 0.6 }]}
              onPress={hasPendingScratch ? goToScratch : goHome}
              disabled={scratchCtaBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: scratchCtaBusy, busy: scratchCtaBusy }}
            >
              {scratchCtaBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {hasPendingScratch ? t('scratch.claim.cta') : t('claim.successCta')}
                </Text>
              )}
            </TouchableOpacity>
          </>
        );
      }
      case 'error':
        return (
          <>
            <AlertCircle size={56} color={theme.danger} />
            <Text style={[styles.title, { color: theme.text }]}>{t('claim.title')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{t(`claim.${screen.messageKey}`)}</Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={goHome}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </>
        );
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
  scratchNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  scratchNoteText: { fontWeight: '700', fontSize: 14 },
});
