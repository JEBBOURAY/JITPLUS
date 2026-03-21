import React from 'react';
import SharedOfflineBanner from '@jitplus/shared/src/OfflineBanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return <SharedOfflineBanner topInset={insets.top} />;
}
