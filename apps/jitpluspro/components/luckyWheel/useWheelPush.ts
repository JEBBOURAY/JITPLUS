import { useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGamePush, type GamePushMessage } from '@/components/games/useGamePush';
import { formatMoney } from '@/config/currency';
import { getMerchantCurrency } from '@/hooks/useCurrency';
import { formatWheelPeriod } from './WheelUI';
import type { WheelCampaign } from './types';

type WheelPushSource = Pick<WheelCampaign, 'name' | 'startsAt' | 'endsAt' | 'minSpendAmount'> & {
  prizes: { label: string }[];
};

/** Amount in running text ("dès 100 DH"), in the merchant's currency. */
export function formatWheelMoney(amount: number, locale: string): string {
  return formatMoney(amount, getMerchantCurrency().code, locale);
}

/** Notification announcing a wheel to every client of the merchant. */
function wheelPushMessage(
  campaign: WheelPushSource,
  t: (key: string, params?: Record<string, unknown>) => string,
  locale: string,
): GamePushMessage {
  const prizes = campaign.prizes.map((p) => p.label).filter(Boolean).join(', ');
  const lines = [
    t('luckyWheel.push.body', { prizes, period: formatWheelPeriod(campaign, locale) }),
    campaign.minSpendAmount > 0 ? t('luckyWheel.push.minSpend', { amount: formatWheelMoney(campaign.minSpendAmount, locale) }) : '',
  ];
  return { title: t('luckyWheel.push.title', { name: campaign.name }), body: lines.filter(Boolean).join('\n') };
}

/** Announces a wheel to the merchant's clients, on the merchant's confirmation. */
export function useWheelPush() {
  const { t, locale } = useLanguage();
  const game = useGamePush();
  const { prompt: promptMessage, offer: offerMessage } = game;

  const prompt = useCallback(
    (campaign: WheelPushSource, onDone?: () => void) => promptMessage(wheelPushMessage(campaign, t, locale), onDone),
    [promptMessage, t, locale],
  );
  /** Right after the launch: asks first, then shows the preview. */
  const offer = useCallback(
    (campaign: WheelPushSource, onDone?: () => void) =>
      offerMessage(t('luckyWheel.wizard.launchedTitle'), wheelPushMessage(campaign, t, locale), onDone),
    [offerMessage, t, locale],
  );

  return { prompt, offer, isPending: game.isPending };
}
