import React from 'react';
import SharedOfflineBanner from '@jitplus/shared/src/OfflineBanner';
import { useLanguage } from '@/contexts/LanguageContext';

export default function OfflineBanner() {
  const { t } = useLanguage();
  return <SharedOfflineBanner text={t('offline.noConnection')} />;
}
