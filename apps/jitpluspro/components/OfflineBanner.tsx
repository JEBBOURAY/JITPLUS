import React from 'react';
import SharedOfflineBanner from '@jitplus/shared/src/OfflineBanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';

// The shared banner defaults to French: pass the merchant's language.
export default React.memo(function OfflineBanner() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  return <SharedOfflineBanner text={t('login.offlineBanner')} topInset={insets.top} />;
});
