import { moneyFormatter } from '@jitplus/shared/src/currency';
import React from 'react';
import { Gift } from 'lucide-react-native';
import { formatDate } from '@/utils/date';
import type { AppFonts } from '@/utils/fonts';
import { getScratchEntryStatus, type ScratchEntryStatus } from '@/utils/scratchHistory';
import { formatRewardValue } from '@jitplus/shared/src/scratch';
import type { ScratchCardDto } from '@jitplus/shared/src/scratch';
import { GameHistoryEmpty, GameHistoryList, GameHistoryRow, HISTORY_TONES, type HistoryTone } from '../GameHistory';

interface Props {
  toUse: ScratchCardDto[];
  past: ScratchCardDto[];
  locale: string;
  bottomInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpen: (card: ScratchCardDto) => void;
}

const STATUS_TONE: Record<Exclude<ScratchEntryStatus, 'pending'>, HistoryTone> = {
  toUse: HISTORY_TONES.pending,
  used: HISTORY_TONES.success,
  expired: HISTORY_TONES.failed,
  cancelled: HISTORY_TONES.failed,
  missed: HISTORY_TONES.muted,
};

/** Scratch card history on the dark stage: gifts to use first, then past cards. */
export default React.memo(function ScratchHistory({ toUse, past, locale, bottomInset, fonts, t, onOpen }: Props) {
  if (!toUse.length && !past.length) {
    return <GameHistoryEmpty title={t('scratch.hub.noHistory')} hint={t('scratch.hub.noHistoryHint')} fonts={fonts} />;
  }

  const renderRow = (card: ScratchCardDto) => {
    const status = getScratchEntryStatus(card);
    if (status === 'pending') return null;
    const coupon = card.coupon;
    const merchant = card.merchant.nom || card.campaign.name;
    const title = coupon
      ? formatRewardValue({ type: coupon.type, value: coupon.value, label: coupon.label }, t, moneyFormatter(card.merchant.currency, locale))
      : t('scratch.hub.missed');
    const statusLabel = status === 'missed' && card.status === 'CANCELLED'
      ? t('scratch.hub.status.missedCancelled')
      : t(`scratch.hub.status.${status}`);
    return (
      <GameHistoryRow
        key={card.id}
        logoUrl={card.merchant.logoUrl}
        merchant={merchant}
        title={title}
        date={formatDate(card.scratchedAt ?? card.expiresAt, locale)}
        deadline={status === 'toUse' && coupon
          ? t('scratch.conditions.expiresAt', { date: formatDate(coupon.expiresAt, locale) })
          : null}
        statusLabel={statusLabel}
        tone={STATUS_TONE[status]}
        won={!!coupon}
        BadgeIcon={Gift}
        highlighted={status === 'toUse'}
        accessibilityLabel={t('scratch.hub.itemA11y', { title, merchant, status: statusLabel })}
        onPress={coupon ? () => onOpen(card) : undefined}
        fonts={fonts}
      />
    );
  };

  return (
    <GameHistoryList
      bottomInset={bottomInset}
      fonts={fonts}
      sections={[
        {
          title: t('scratch.hub.toUse', { count: toUse.length }),
          hint: t('scratch.hub.toUseHint'),
          rows: toUse.map(renderRow),
        },
        { title: t('scratch.hub.past'), rows: past.map(renderRow) },
      ]}
    />
  );
});
