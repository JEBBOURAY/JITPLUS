import { useCallback } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { dealErrorAction } from './dealForm';

/**
 * Shows a deal save error with the backend message, plus the way out it calls
 * for: add a store position, open the deal already live, or see the deals.
 * `beforeNavigate` runs before leaving the screen (e.g. lifting a discard prompt).
 */
export function useDealErrorAlert({ beforeNavigate, onSeeDeals }: { beforeNavigate?: () => void; onSeeDeals?: () => void } = {}) {
  const { t } = useLanguage();
  const router = useRouter();
  return useCallback((error: unknown) => {
    const message = getErrorMessage(error, t('common.genericError'));
    const action = dealErrorAction(error);
    const cancel: AlertButton = { text: t('common.cancel'), style: 'cancel' };
    switch (action?.kind) {
      case 'needsLocation':
        Alert.alert(t('deals.errors.needsLocationTitle'), message, [
          cancel,
          { text: t('deals.errors.addLocation'), onPress: () => router.push('/stores') },
        ]);
        return;
      case 'duplicate': {
        const { dealId } = action;
        Alert.alert(t('deals.errors.duplicateTitle'), message, [
          cancel,
          {
            text: t('deals.errors.extendExisting'),
            onPress: () => {
              beforeNavigate?.();
              router.replace({ pathname: '/deals/[id]', params: { id: dealId } });
            },
          },
        ]);
        return;
      }
      case 'limit':
        Alert.alert(
          t('deals.list.limitTitle'),
          message,
          onSeeDeals
            ? [cancel, { text: t('deals.errors.seeDeals'), onPress: () => { beforeNavigate?.(); onSeeDeals(); } }]
            : undefined,
        );
        return;
      default:
        Alert.alert(t('common.error'), message);
    }
  }, [t, router, beforeNavigate, onSeeDeals]);
}
