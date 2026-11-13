import React, { useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import type { LuckyWheelDraw } from '@/types';
import type { AppFonts } from '@/utils/fonts';
import { getDrawStatus, type DrawStatus } from '@/utils/luckyWheel';
import { hp } from '@/utils/responsive';
import { GameHistoryEmpty, GameHistoryList, GameHistoryRow, HISTORY_TONES, type HistoryTone } from '../GameHistory';

interface Props {
  draws: LuckyWheelDraw[];
  loading: boolean;
  localeTag: string;
  bottomInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const STATUS_STYLE: Record<DrawStatus, { tone: HistoryTone; key: string }> = {
  pending: { tone: HISTORY_TONES.pending, key: 'luckyWheel.pending' },
  claimed: { tone: HISTORY_TONES.success, key: 'luckyWheel.claimed' },
  expired: { tone: HISTORY_TONES.failed, key: 'luckyWheel.expired' },
  lost: { tone: HISTORY_TONES.muted, key: 'luckyWheel.lost' },
};

/** Draw history on the wheel's dark stage: prizes to collect first, then past draws. */
export default React.memo(function WheelHistory({ draws, loading, localeTag, bottomInset, fonts, t }: Props) {
  const { toCollect, past } = useMemo(() => {
    const now = new Date();
    const collect: LuckyWheelDraw[] = [];
    const rest: LuckyWheelDraw[] = [];
    for (const d of draws) (getDrawStatus(d, now) === 'pending' ? collect : rest).push(d);
    return { toCollect: collect, past: rest };
  }, [draws]);

  if (loading) {
    return <ActivityIndicator color={palette.goldLight} style={{ marginTop: hp(48) }} />;
  }

  if (!draws.length) {
    return <GameHistoryEmpty title={t('luckyWheel.noHistory')} hint={t('luckyWheel.noHistoryHint')} fonts={fonts} />;
  }

  const formatDate = (iso: string, withYear = true) =>
    new Date(iso).toLocaleDateString(localeTag, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

  const renderRow = (draw: LuckyWheelDraw) => {
    const status = getDrawStatus(draw);
    const won = draw.result === 'WON';
    const merchant = draw.ticket?.campaign?.merchant?.nom ?? draw.ticket?.campaign?.name ?? '';
    const title = won ? (draw.prize?.label ?? t('luckyWheel.won')) : t('luckyWheel.lostShort');
    const date = formatDate(draw.createdAt);
    return (
      <GameHistoryRow
        key={draw.id}
        logoUrl={draw.ticket?.campaign?.merchant?.logoUrl}
        merchant={merchant}
        title={title}
        date={date}
        deadline={status === 'pending' && draw.claimBefore
          ? t('luckyWheel.claimBefore', { date: formatDate(draw.claimBefore, false) })
          : null}
        statusLabel={t(STATUS_STYLE[status].key)}
        tone={STATUS_STYLE[status].tone}
        won={won}
        BadgeIcon={Trophy}
        highlighted={status === 'pending'}
        accessibilityLabel={t('luckyWheel.historyItemA11y', {
          result: title,
          merchant,
          campaign: draw.ticket?.campaign?.name ?? '',
          date,
        })}
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
          title: t('luckyWheel.toCollect', { count: toCollect.length }),
          hint: t('luckyWheel.toCollectHint'),
          rows: toCollect.map(renderRow),
        },
        { title: t('luckyWheel.pastDraws'), rows: past.map(renderRow) },
      ]}
    />
  );
});
