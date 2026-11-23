import { useEffect, useState } from 'react';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { GameModal, gameModalText } from '@/components/games/GameModal';
import { SCRATCH_LIMITS, addDaysYmd, type CancelPreview, type ScratchCampaignDto } from '@jitplus/shared/src/scratch';
import { Button } from './ScratchUI';
import { DateField } from './DateField';
import { moroccoToday, moroccoYmdOf } from './campaignForm';

const CANCEL_DELAY_S = 3;

/** Last step of cancelling a sent campaign: the button unlocks after a short countdown. */
export function FinalCancelModal({ visible, preview, loading, onConfirm, onClose }: {
  visible: boolean;
  preview: CancelPreview | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(CANCEL_DELAY_S);

  // Restart the countdown each time the modal opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setRemaining(CANCEL_DELAY_S);
  }

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setRemaining((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  return (
    <GameModal visible={visible} onClose={onClose}>
      <Text maxFontSizeMultiplier={1.4} style={[gameModalText.title, { color: theme.danger }]}>{t('scratch.detail.cancelFinalTitle')}</Text>
      {preview && (
        <Text maxFontSizeMultiplier={1.4} style={[gameModalText.body, { color: theme.textSecondary }]}>
          {t('scratch.detail.cancelStep1', { cards: preview.pendingCards, coupons: preview.activeCoupons, redeemed: preview.redeemedCoupons })}
        </Text>
      )}
      <Text maxFontSizeMultiplier={1.4} style={[gameModalText.body, { color: theme.text }]}>{t('scratch.detail.cancelFinalBody')}</Text>
      <Button
        variant="danger"
        label={remaining > 0 ? t('scratch.detail.cancelWait', { seconds: remaining }) : t('scratch.detail.cancelFinal')}
        disabled={remaining > 0}
        loading={loading}
        onPress={onConfirm}
      />
      <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
    </GameModal>
  );
}

/** Pushes back the card and coupon deadlines of a sent campaign. */
export function ExtendDatesModal({ visible, campaign, loading, onClose, onSave }: {
  visible: boolean;
  campaign: ScratchCampaignDto;
  loading: boolean;
  onClose: () => void;
  onSave: (dates: { cardExpiresOn?: string; couponExpiresOn?: string }) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [card, setCard] = useState(campaign.cardExpiresOn);
  const [coupon, setCoupon] = useState(campaign.couponExpiresOn);

  // Start from the saved dates on each opening (and when they change while open).
  const syncKey = visible ? `${campaign.cardExpiresOn}|${campaign.couponExpiresOn}` : null;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (syncKey) {
      setCard(campaign.cardExpiresOn);
      setCoupon(campaign.couponExpiresOn);
    }
  }

  const today = moroccoToday();
  const cardMin = campaign.cardExpiresOn > today ? campaign.cardExpiresOn : today;
  const sentYmd = campaign.sentAt ? moroccoYmdOf(new Date(campaign.sentAt)) : today;
  const couponMin = addDaysYmd(card, SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS);
  const changed = card !== campaign.cardExpiresOn || coupon !== campaign.couponExpiresOn;

  return (
    <GameModal visible={visible} onClose={onClose}>
      <Text maxFontSizeMultiplier={1.4} style={[gameModalText.title, { color: theme.text }]}>{t('scratch.detail.extendTitle')}</Text>
      <Text maxFontSizeMultiplier={1.4} style={[gameModalText.body, { color: theme.textSecondary }]}>{t('scratch.detail.extendHint')}</Text>
      <DateField
        label={t('scratch.wizard.cardDeadline')}
        value={card}
        minYmd={cardMin}
        maxYmd={addDaysYmd(sentYmd, SCRATCH_LIMITS.MAX_CARD_DAYS)}
        onChange={(v) => {
          setCard(v);
          const minCoupon = addDaysYmd(v, SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS);
          if (minCoupon > coupon) setCoupon(minCoupon);
        }}
      />
      <DateField
        label={t('scratch.wizard.couponDeadline')}
        value={coupon}
        minYmd={couponMin > campaign.couponExpiresOn ? couponMin : campaign.couponExpiresOn}
        maxYmd={addDaysYmd(sentYmd, SCRATCH_LIMITS.MAX_COUPON_DAYS)}
        onChange={setCoupon}
      />
      <Button
        label={t('scratch.detail.extendSave')}
        disabled={!changed}
        loading={loading}
        onPress={() => onSave({
          cardExpiresOn: card !== campaign.cardExpiresOn ? card : undefined,
          couponExpiresOn: coupon !== campaign.couponExpiresOn ? coupon : undefined,
        })}
      />
      <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
    </GameModal>
  );
}
