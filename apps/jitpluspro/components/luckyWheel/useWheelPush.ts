import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSendPushNotification } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { formatWheelPeriod } from './WheelUI';
import type { WheelCampaign } from './types';

type WheelPushSource = Pick<WheelCampaign, 'name' | 'startsAt' | 'endsAt' | 'minSpendAmount'> & {
  prizes: { label: string }[];
};

export function formatWheelMoney(amount: number, locale: string): string {
  return formatCurrency(amount, DEFAULT_CURRENCY, getIntlLocale(locale));
}

/** Notification announcing a wheel to every client of the merchant. */
function wheelPushMessage(
  campaign: WheelPushSource,
  t: (key: string, params?: Record<string, unknown>) => string,
  locale: string,
): { title: string; body: string } {
  const prizes = campaign.prizes.map((p) => p.label).filter(Boolean).join(', ');
  const lines = [
    t('luckyWheel.push.body', { prizes, period: formatWheelPeriod(campaign, locale) }),
    campaign.minSpendAmount > 0 ? t('luckyWheel.push.minSpend', { amount: formatWheelMoney(campaign.minSpendAmount, locale) }) : '',
  ];
  return { title: t('luckyWheel.push.title', { name: campaign.name }), body: lines.filter(Boolean).join('\n') };
}

/** Shows the notification as clients will get it, then sends it on confirmation. */
export function useWheelPush() {
  const { t, locale } = useLanguage();
  const push = useSendPushNotification();
  const { mutateAsync } = push;

  const prompt = useCallback((campaign: WheelPushSource, onDone?: () => void) => {
    const { title, body } = wheelPushMessage(campaign, t, locale);
    Alert.alert(t('luckyWheel.push.previewTitle'), `${title}\n\n${body}`, [
      { text: t('common.cancel'), style: 'cancel', onPress: onDone },
      {
        text: t('luckyWheel.push.send'),
        onPress: async () => {
          try {
            const result = await mutateAsync({ title, body });
            Alert.alert(
              t('messages.pushSuccessTitle'),
              t(result.successCount === 1 ? 'luckyWheel.push.success_one' : 'luckyWheel.push.success_other', { count: result.successCount }),
            );
          } catch (e) {
            Alert.alert(t('common.error'), getErrorMessage(e, t('luckyWheel.push.error')));
          } finally {
            onDone?.();
          }
        },
      },
    ], { cancelable: true, onDismiss: onDone });
  }, [mutateAsync, t, locale]);

  return { prompt, isPending: push.isPending };
}
