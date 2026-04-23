import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTransactionsHistory } from '@/hooks/useQueryHooks';
import TransactionHistoryScreen from '@/components/TransactionHistoryScreen';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function ScanHistoryScreen() {
  const { t } = useLanguage();
  const query = useTransactionsHistory();
  return (
    <TransactionHistoryScreen
      headerTitle={t('scanHistory.title') || 'Historique'}
      headerSubtitle={t('scanHistory.subtitle') || 'Vos activités récentes'}
      emptyText={t('scanHistory.empty') || 'Aucune activité'}
      query={query}
    />
  );
}
