import React from 'react';
import { Gift } from 'lucide-react-native';
import { formatDate } from '@/utils/date';
import type { AppFonts } from '@/utils/fonts';
import { getCollectionGiftStatus, type CollectionGiftStatus } from '@/utils/collectionHistory';
import type { ClientCollectionGift } from '@jitplus/shared/src/collection';
import { GameHistoryEmpty, GameHistoryList, GameHistoryRow, HISTORY_TONES, type HistoryTone } from '../GameHistory';

interface Props {
  toUse: ClientCollectionGift[];
  past: ClientCollectionGift[];
  locale: string;
  bottomInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpen: (couponId: string) => void;
}

const STATUS_TONE: Record<CollectionGiftStatus, HistoryTone> = {
  soon: HISTORY_TONES.pending,
  toUse: HISTORY_TONES.pending,
  used: HISTORY_TONES.success,
  expired: HISTORY_TONES.failed,
  cancelled: HISTORY_TONES.failed,
  gone: HISTORY_TONES.muted,
};

/** Collection gifts on the dark stage: gifts to use first, then past ones (same layout as the other games). */
export default React.memo(function CollectionHistory({ toUse, past, locale, bottomInset, fonts, t, onOpen }: Props) {
  if (!toUse.length && !past.length) {
    return <GameHistoryEmpty title={t('collections.hub.noHistory')} hint={t('collections.hub.noHistoryHint')} fonts={fonts} />;
  }

  const renderRow = (gift: ClientCollectionGift) => {
    const status = getCollectionGiftStatus(gift);
    const coupon = gift.coupon;
    const merchant = gift.merchant.nom;
    const statusLabel = t(`collections.hub.status.${status}`);
    let deadline: string | null = null;
    if (coupon && status === 'soon') deadline = t('collections.hub.usableFrom', { date: formatDate(coupon.validFrom, locale) });
    else if (coupon && status === 'toUse') deadline = t('collections.hub.expiresAt', { date: formatDate(coupon.expiresAt, locale) });
    return (
      <GameHistoryRow
        key={gift.id}
        logoUrl={gift.merchant.logoUrl}
        merchant={merchant}
        title={gift.giftLabel}
        date={formatDate(gift.completedAt, locale)}
        deadline={deadline}
        statusLabel={statusLabel}
        tone={STATUS_TONE[status]}
        won
        BadgeIcon={Gift}
        highlighted={status === 'toUse' || status === 'soon'}
        accessibilityLabel={t('collections.hub.itemA11y', { title: gift.giftLabel, merchant, status: statusLabel })}
        onPress={coupon ? () => onOpen(coupon.id) : undefined}
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
          title: t('collections.hub.toUse', { count: toUse.length }),
          hint: t('collections.hub.toUseHint'),
          rows: toUse.map(renderRow),
        },
        { title: t('collections.hub.past'), rows: past.map(renderRow) },
      ]}
    />
  );
});
