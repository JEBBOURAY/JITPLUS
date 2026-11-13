import { useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Package } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { pluralKey } from '@jitplus/shared';

import {
  RedeemConfirm, RedeemError, RedeemLayout, RedeemLoading, RedeemLoginPrompt, RedeemSuccessIcon,
  RedeemPrimaryButton, RedeemText, RedeemTitle, useRedeemFlow,
} from '@/components/redeem/RedeemFlow';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import type { StampCodeRedeemResult } from '@/services/api/stamp-codes';
import { queryKeys } from '@/hooks/useQueryHooks';
import { clearPendingStampCode, savePendingStampCode } from '@/services/pendingClaim';
import { isStampCodeToken } from '@/utils/ids';

type ErrorKey = 'errorInvalid' | 'errorUsed' | 'errorRevoked' | 'errorMerchantFull' | 'errorLimit' | 'errorNetwork' | 'errorRetry';

/** Failures after which the code is still usable: the screen offers to try again. */
const RETRYABLE: ReadonlySet<ErrorKey> = new Set(['errorNetwork', 'errorRetry']);

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

function classifyError(err: unknown) {
  const messageKey = errorKeyOf(err);
  return { messageKey, retryable: RETRYABLE.has(messageKey) };
}

/**
 * E-commerce parcel QR code: the client scanned the code slipped into their
 * order with the phone camera. Same flow as the Quick-Add claim screen
 * (see useRedeemFlow).
 */
export default function StampCodeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const client = useAuthStore((s) => s.client);
  const params = useLocalSearchParams<{ token?: string }>();
  const queryClient = useQueryClient();

  const token = typeof params.token === 'string' ? params.token : '';
  const { screen, run } = useRedeemFlow<StampCodeRedeemResult, ErrorKey>({
    token,
    tokenValid: isStampCodeToken(token),
    clientId: client?.id,
    invalidKey: 'errorInvalid',
    redeem: (code) => api.redeemStampCode(code),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.stamps }); },
    classifyError,
    savePending: savePendingStampCode,
    clearPending: clearPendingStampCode,
  });

  const accountName = client
    ? `${client.prenom ?? ''} ${client.nom ?? ''}`.trim() || t('qr.client')
    : '';

  const goHome = useCallback(() => router.replace('/(tabs)'), [router]);
  const goToLogin = useCallback(() => router.replace('/welcome'), [router]);
  const redeem = useCallback(() => { void run(); }, [run]);

  const renderBody = () => {
    switch (screen.kind) {
      case 'loading':
        return <RedeemLoading label={t('stampCode.loading')} />;
      case 'login-required':
        return (
          <RedeemLoginPrompt
            title={t('stampCode.loginPromptTitle')}
            body={t('stampCode.loginPromptBody')}
            cta={t('stampCode.loginPromptCta')}
            onLogin={goToLogin}
          />
        );
      case 'confirm':
        return (
          <RedeemConfirm
            Icon={Package}
            title={t('stampCode.confirmTitle')}
            body={t('stampCode.confirmBody', { name: accountName })}
            cta={t('stampCode.confirmCta')}
            cancelLabel={t('common.cancel')}
            onConfirm={redeem}
            onCancel={goHome}
          />
        );
      case 'success': {
        const { result } = screen;
        return (
          <>
            <RedeemSuccessIcon />
            <RedeemTitle>
              {result.alreadyRedeemed ? t('stampCode.alreadyTitle') : t(pluralKey('stampCode.successTitle', result.stamps, locale), { count: result.stamps })}
            </RedeemTitle>
            <RedeemText>
              {t('stampCode.successBody', { merchant: result.merchant.nom, balance: result.newBalance })}
            </RedeemText>
            <RedeemPrimaryButton
              label={t('stampCode.successCta')}
              onPress={() => router.replace({ pathname: '/merchant/[id]', params: { id: result.merchant.id } })}
            />
          </>
        );
      }
      case 'error':
        return (
          <RedeemError
            title={t('stampCode.title')}
            message={t(`stampCode.${screen.messageKey}`)}
            retryLabel={screen.retryable ? t('stampCode.retry') : null}
            closeLabel={t('common.close')}
            onRetry={redeem}
            onClose={goHome}
          />
        );
    }
  };

  return <RedeemLayout stateKey={screen.kind}>{renderBody()}</RedeemLayout>;
}
