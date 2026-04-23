import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRewardsHistory } from '@/hooks/useQueryHooks';
import TransactionHistoryScreen from '@/components/TransactionHistoryScreen';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function RewardsHistoryScreen() {
  const { t } = useLanguage();
  const query = useRewardsHistory();
  return (
    <TransactionHistoryScreen
      headerTitle={t('rewardsHistory.title') || 'Cadeaux'}
      headerSubtitle={t('rewardsHistory.subtitle') || 'Vos cadeaux gagnés'}
      emptyText={t('rewardsHistory.empty') || 'Aucun cadeau'}
      query={query}
    />
  );
}
