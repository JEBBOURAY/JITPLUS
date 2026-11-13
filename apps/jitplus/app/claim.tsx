import { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ticket } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  RedeemConfirm, RedeemError, RedeemLayout, RedeemLoading, RedeemLoginPrompt, RedeemSuccessIcon,
  RedeemPrimaryButton, RedeemText, RedeemTitle, useRedeemFlow,
} from '@/components/redeem/RedeemFlow';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { invalidateScratchCards, usePendingScratchCards } from '@/hooks/useScratchHooks';
import { queryKeys } from '@/hooks/useQueryHooks';
import { clearPendingClaim, savePendingClaim } from '@/services/pendingClaim';
import { isClaimToken } from '@/utils/ids';

type ConsumeResult = { success: true; alreadyConsumed: boolean; mergedCards: number; pendingScratchCards?: number; merchant: { id: string; nom: string | null } };

type ErrorKey = 'errorExpired' | 'errorInvalid' | 'errorAlreadyUsed' | 'errorNetwork';

function classifyError(err: unknown): { messageKey: ErrorKey; retryable: boolean } {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 410) return { messageKey: 'errorExpired', retryable: false };
  if (status === 403) return { messageKey: 'errorAlreadyUsed', retryable: false };
  // No response, rate limit or server error: the link was not consumed.
  if (!status || status === 429 || status >= 500) return { messageKey: 'errorNetwork', retryable: true };
  return { messageKey: 'errorInvalid', retryable: false };
}

/**
 * Quick-Add claim link: merges the cards a merchant created for this phone
 * number into the account (see useRedeemFlow for the shared steps).
 */
export default function ClaimScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const client = useAuthStore((s) => s.client);
  const params = useLocalSearchParams<{ token?: string }>();
  const queryClient = useQueryClient();

  const token = typeof params.token === 'string' ? params.token : '';
  const { screen, run } = useRedeemFlow<ConsumeResult, ErrorKey>({
    token,
    tokenValid: isClaimToken(token),
    clientId: client?.id,
    invalidKey: 'errorInvalid',
    redeem: (claimToken) => api.consumeClaim(claimToken),
    // The merge moved cards and scratch cards onto this account; cached lists predate it.
    onSuccess: () => {
      invalidateScratchCards(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.stamps });
    },
    classifyError,
    savePending: savePendingClaim,
    clearPending: clearPendingClaim,
  });

  const accountName = client
    ? `${client.prenom ?? ''} ${client.nom ?? ''}`.trim() || t('qr.client')
    : '';

  const goHome = useCallback(() => router.replace('/(tabs)'), [router]);
  const goToLogin = useCallback(() => router.replace('/welcome'), [router]);
  const consume = useCallback(() => { void run(); }, [run]);

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

  const renderBody = () => {
    switch (screen.kind) {
      case 'loading':
        return <RedeemLoading label={t('claim.loading')} />;
      case 'login-required':
        return (
          <RedeemLoginPrompt
            title={t('claim.loginPromptTitle')}
            body={t('claim.loginPromptBody')}
            cta={t('claim.loginPromptCta')}
            onLogin={goToLogin}
          />
        );
      case 'confirm':
        return (
          <RedeemConfirm
            Icon={Ticket}
            title={t('claim.confirmTitle')}
            body={t('claim.confirmBody', { name: accountName })}
            cta={t('claim.confirmCta')}
            cancelLabel={t('common.cancel')}
            onConfirm={consume}
            onCancel={goHome}
          />
        );
      case 'success':
        return (
          <>
            <RedeemSuccessIcon />
            <RedeemTitle>{t('claim.successTitle')}</RedeemTitle>
            <RedeemText>{t('claim.successBody', { merchant: screen.result.merchant.nom ?? 'JitPlus' })}</RedeemText>
            {hasPendingScratch && (
              <View style={[styles.scratchNote, { borderColor: theme.primary }]}>
                <Ticket size={20} color={theme.primary} />
                <Text style={[styles.scratchNoteText, { color: theme.primary }]}>{t('scratch.claim.pending')}</Text>
              </View>
            )}
            <RedeemPrimaryButton
              label={hasPendingScratch ? t('scratch.claim.cta') : t('claim.successCta')}
              onPress={hasPendingScratch ? goToScratch : goHome}
              busy={scratchCtaBusy}
            />
          </>
        );
      case 'error':
        return (
          <RedeemError
            title={t('claim.title')}
            message={t(`claim.${screen.messageKey}`)}
            retryLabel={screen.retryable ? t('common.retry') : null}
            closeLabel={t('common.close')}
            onRetry={consume}
            onClose={goHome}
          />
        );
    }
  };

  return <RedeemLayout stateKey={screen.kind}>{renderBody()}</RedeemLayout>;
}

const styles = StyleSheet.create({
  scratchNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  scratchNoteText: { fontWeight: '600', fontSize: 14 },
});
