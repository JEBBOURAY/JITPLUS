import React from 'react';
import SharedOfflineBanner from '@jitplus/shared/src/OfflineBanner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default React.memo(function OfflineBanner() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  return <SharedOfflineBanner text={t('offline.noConnection')} topInset={insets.top} />;
})
