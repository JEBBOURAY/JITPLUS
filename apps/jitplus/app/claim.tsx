import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';

const PENDING_CLAIM_KEY = 'pendingClaimToken';
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type ConsumeResult = { success: true; alreadyConsumed: boolean; mergedCards: number; merchant: { id: string; nom: string | null } };

type Screen =
  | { kind: 'loading' }
  | { kind: 'login-required' }
  | { kind: 'success'; result: ConsumeResult }
  | { kind: 'error'; messageKey: 'errorExpired' | 'errorInvalid' | 'errorAlreadyUsed' };

export default function ClaimScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();
  const client = useAuthStore((s) => s.client);
  const params = useLocalSearchParams<{ token?: string }>();
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  const token = typeof params.token === 'string' ? params.token : '';
  const tokenValid = TOKEN_RE.test(token);

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
    setScreen({ kind: 'loading' });
    try {
      const result = await api.consumeClaim(token);
      // Clean up the stored pending token (may have been stashed before login).
      try { await SecureStore.deleteItemAsync(PENDING_CLAIM_KEY); } catch {}
      setScreen({ kind: 'success', result });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 410) setScreen({ kind: 'error', messageKey: 'errorExpired' });
      else if (status === 403) setScreen({ kind: 'error', messageKey: 'errorAlreadyUsed' });
      else setScreen({ kind: 'error', messageKey: 'errorInvalid' });
    }
  }, [token, tokenValid]);

  // Stash token + bounce to welcome if not authenticated; otherwise consume.
  useEffect(() => {
    if (!tokenValid) {
      setScreen({ kind: 'error', messageKey: 'errorInvalid' });
      return;
    }
    if (!client) {
      (async () => {
        try { await SecureStore.setItemAsync(PENDING_CLAIM_KEY, token); } catch {}
        setScreen({ kind: 'login-required' });
      })();
      return;
    }
    void consume();
  }, [client, consume, token, tokenValid]);

  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const goToLogin = useCallback(() => {
    router.replace('/welcome');
  }, [router]);

  // ── UI ──
  const renderBody = () => {
    switch (screen.kind) {
      case 'loading':
        return (
          <>
            <ActivityIndicator size="large" color={theme.primary} />
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
      case 'success': {
        const merchantName = screen.result.merchant.nom ?? 'JitPlus';
        return (
          <>
            <CheckCircle2 size={64} color={theme.success} />
            <Text style={[styles.title, { color: theme.text }]}>{t('claim.successTitle')}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              {t('claim.successBody', { merchant: merchantName })}
            </Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={goHome}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{t('claim.successCta')}</Text>
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
});
