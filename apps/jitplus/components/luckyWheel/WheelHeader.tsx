import React from 'react';
import type { AppFonts } from '@/utils/fonts';
import { GameHeader } from '../GameStage';
import type { WheelPhase } from './useLuckyWheel';

interface Props {
  phase: WheelPhase;
  spinning: boolean;
  pendingCount: number;
  isRTL: boolean;
  topInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onClose: () => void;
  onBack: () => void;
  onOpenHistory: () => void;
}

export default React.memo(function WheelHeader({
  phase, spinning, pendingCount, isRTL, topInset, fonts, t, onClose, onBack, onOpenHistory,
}: Props) {
  const inHistory = phase === 'history';
  return (
    <GameHeader
      inHistory={inHistory}
      title={inHistory ? t('luckyWheel.history') : t('luckyWheel.title')}
      historyLabel={t('luckyWheel.history')}
      badgeLabel={t('luckyWheel.toCollect', { count: pendingCount })}
      badgeCount={pendingCount}
      historyDisabled={spinning}
      isRTL={isRTL}
      topInset={topInset}
      fonts={fonts}
      t={t}
      onClose={onClose}
      onBack={onBack}
      onOpenHistory={onOpenHistory}
    />
  );
});
